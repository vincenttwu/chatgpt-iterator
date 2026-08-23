import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApplicationRepositories, PERSISTENCE_STORES } from '../src/persistence/index.ts';
import { BrowserSessionTracker, RunRuntimeServer } from '../src/runtime/index.ts';
import { AutoDiscardGuardManager } from '../src/tabs/index.ts';
import { DurableRunManager, DurableRunRepository, RepeatRunCoordinator } from '../src/runs/index.ts';
import { SidePanelOperationalClient } from '../src/ui/run-workspace.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const clone = (value) => structuredClone(value);
const keyFor = (store, value) => store === 'metadata' ? value.key : value.id;

function matchesIndex(store, index, value, query) {
  if (query === undefined) return true;
  if (store === 'runEvents' && index === 'byRunId') return value.runId === query;
  if (store === 'runEvents' && index === 'byRunSequence') return Array.isArray(query) && value.runId === query[0] && value.sequence === query[1];
  return value[index === 'byUpdatedAt' ? 'updatedAt' : index === 'byOccurredAt' ? 'occurredAt' : 'id'] === query;
}

class MemoryDriver {
  state = new Map(PERSISTENCE_STORES.map((name) => [name, new Map()]));
  async transaction(stores, mode, work) {
    const before = new Map([...this.state].map(([name, values]) => [name, new Map([...values].map(([key, value]) => [key, clone(value)]))]));
    const port = { store: (name) => ({
      get: async (key) => { const value = this.state.get(name).get(key); return value === undefined ? undefined : clone(value); },
      getAll: async () => [...this.state.get(name).values()].map(clone),
      getAllByIndex: async (indexName, query) => [...this.state.get(name).values()].filter((value) => matchesIndex(name, indexName, value, query)).map(clone),
      put: async (value) => { if (mode !== 'readwrite') throw new Error('readonly'); this.state.get(name).set(keyFor(name, value), clone(value)); },
      delete: async (key) => { if (mode !== 'readwrite') throw new Error('readonly'); this.state.get(name).delete(key); },
    }) };
    try { return await work(port); } catch (error) { this.state = before; throw error; }
  }
  close() {}
}

function runHarness() {
  const repositories = new ApplicationRepositories(new MemoryDriver());
  let tick = 0;
  const base = Date.parse('2026-08-24T04:30:00+08:00');
  const repository = new DurableRunRepository(repositories, { now: () => new Date(base + tick++ * 1000).toISOString(), id: () => crypto.randomUUID() });
  return { manager: new DurableRunManager(repository), repository };
}

async function createStarted(manager, options = {}) {
  let run = (await manager.create({ targetTabId: options.tabId ?? 10, targetWindowId: options.windowId ?? 2, commandId: crypto.randomUUID(), messageTemplate: 'Continue {iteration}', totalIterations: options.totalIterations ?? 1, delaySeconds: options.delaySeconds ?? 5, autoContinue: true, autoScroll: true, preventDiscard: options.preventDiscard ?? true })).snapshot;
  return (await manager.start(run.id, run.generation, crypto.randomUUID())).snapshot;
}

function tabSnapshot(lifecycleState, { tabId = 10, windowId = 2, active = false } = {}) {
  return { schemaVersion: 1, revision: 1, binding: null, lastTermination: null, targets: [{ schemaVersion: 1, tabId, windowId, active, title: 'ChatGPT', url: 'https://chatgpt.com/c/test', browserStatus: lifecycleState === 'loading' ? 'loading' : 'complete', lifecycleState, autoDiscardable: false, contentConnected: lifecycleState === 'ready', adapterReady: lifecycleState === 'ready', adapterBusy: false, pageAlert: null }] };
}

class MemoryStorage {
  values = new Map();
  async get(key) { const value = this.values.get(key); return value === undefined ? undefined : clone(value); }
  async set(key, value) { this.values.set(key, clone(value)); }
  async remove(key) { this.values.delete(key); }
}

class FakeTabs {
  tabs = new Map();
  updates = [];
  add(tab) { this.tabs.set(tab.id, { active: false, autoDiscardable: true, discarded: false, frozen: false, status: 'complete', windowId: 1, ...tab }); }
  async get(tabId) { const tab = this.tabs.get(tabId); if (!tab) throw new Error('missing tab'); return { ...tab }; }
  async update(tabId, update) { const tab = await this.get(tabId); const next = { ...tab, ...update }; this.tabs.set(tabId, next); this.updates.push([tabId, update]); return next; }
}

class FakeClient {
  sends = [];
  async scrollToBottom() {}
  async send(tabId, message, baseline) { this.sends.push({ tabId, message, baseline }); return { schemaVersion: 1, status: 'sent', assistantBaselineSignature: baseline }; }
}

class FakeWaiter {
  async waitUntilIdle() { return { assistantSignature: '1:base' }; }
  async waitForResponse() { return { assistantSignature: '2:done' }; }
}

class DeferredWaiter extends FakeWaiter {
  gate = Promise.withResolvers();
  async waitUntilIdle(_tabId, cancelled) { await this.gate.promise; if (cancelled()) throw new Error('cancelled'); return { assistantSignature: '1:base' }; }
}

class FakeScheduler {
  pending = new Map();
  async schedule(runId, generation, dueAt, callback) { this.pending.set(runId, { generation, dueAt, callback }); return 'short_timer'; }
  async cancel(runId) { this.pending.delete(runId); }
}

async function eventually(check, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await new Promise((resolve) => setTimeout(resolve, 5)); }
  throw new Error('condition not reached');
}

test('STEP-15 storage.session marker distinguishes same-session worker restart from browser/session reset', async () => {
  const storage = new MemoryStorage();
  const first = await new BrowserSessionTracker(storage, { now: () => '2026-08-24T04:30:00+08:00', id: () => '123e4567-e89b-42d3-a456-426614174000' }).begin();
  const second = await new BrowserSessionTracker(storage).begin();
  assert.equal(first.recoveryKind, 'browser_session_reset');
  assert.equal(second.recoveryKind, 'worker_restart');
  assert.equal(second.sessionId, first.sessionId);
});

test('STEP-15 inactive target execution remains bound to explicit tabId rather than active-tab state', async () => {
  const { manager } = runHarness();
  const client = new FakeClient();
  const coordinator = new RepeatRunCoordinator(manager, client, new FakeWaiter(), new FakeScheduler());
  const run = await createStarted(manager, { tabId: 44, preventDiscard: false });
  coordinator.activate(run);
  await eventually(async () => (await manager.get(run.id))?.lifecycleState === 'completed');
  assert.deepEqual(client.sends.map((entry) => entry.tabId), [44]);
});

test('STEP-15 frozen target suspends a prepared response without false completion and resumes by reconciliation', async () => {
  const { manager } = runHarness();
  let run = await createStarted(manager, { preventDiscard: false });
  run = (await manager.prepareIteration(run.id, run.generation, crypto.randomUUID(), { iteration: 1, message: 'prepared', assistantBaselineSignature: '1:base' })).snapshot;
  await manager.reconcileTabs(tabSnapshot('frozen'));
  let frozen = await manager.get(run.id);
  assert.equal(frozen.lifecycleState, 'frozen');
  assert.equal(frozen.suspensionReason, 'tab_frozen');
  assert.equal(frozen.execution.completedIterations, 0);
  await manager.reconcileTabs(tabSnapshot('ready'));
  const recovered = await manager.get(run.id);
  assert.equal(recovered.lifecycleState, 'waiting_response');
  assert.equal(recovered.execution.activeMessage, 'prepared');
  const client = new FakeClient();
  const coordinator = new RepeatRunCoordinator(manager, client, new FakeWaiter(), new FakeScheduler());
  coordinator.recover([recovered]);
  await eventually(async () => (await manager.get(run.id))?.lifecycleState === 'completed');
  assert.equal(client.sends.length, 0);
});

test('STEP-15 discarded then loading target stays suspended through adapter re-handshake until ready', async () => {
  const { manager } = runHarness();
  let run = await createStarted(manager, { preventDiscard: false });
  run = (await manager.prepareIteration(run.id, run.generation, crypto.randomUUID(), { iteration: 1, message: 'prepared', assistantBaselineSignature: '1:base' })).snapshot;
  await manager.reconcileTabs(tabSnapshot('discarded'));
  assert.equal((await manager.get(run.id)).lifecycleState, 'discarded');
  await manager.reconcileTabs(tabSnapshot('loading'));
  assert.equal((await manager.get(run.id)).lifecycleState, 'reconnecting');
  await manager.reconcileTabs(tabSnapshot('unavailable'));
  assert.equal((await manager.get(run.id)).lifecycleState, 'reconnecting');
  await manager.reconcileTabs(tabSnapshot('ready'));
  const ready = await manager.get(run.id);
  assert.equal(ready.lifecycleState, 'waiting_response');
  assert.equal(ready.execution.completedIterations, 0);
});

test('STEP-15 same-session service-worker recovery preserves waiting-delay deadline for re-arming', async () => {
  const { manager } = runHarness();
  let run = await createStarted(manager, { totalIterations: 2, preventDiscard: false });
  run = (await manager.prepareIteration(run.id, run.generation, crypto.randomUUID(), { iteration: 1, message: 'first', assistantBaselineSignature: '1:base' })).snapshot;
  run = (await manager.completeIteration(run.id, run.generation, crypto.randomUUID(), '2026-08-24T04:31:00+08:00')).snapshot;
  const recovered = await manager.recoverWorker();
  const scheduler = new FakeScheduler();
  new RepeatRunCoordinator(manager, new FakeClient(), new FakeWaiter(), scheduler).recover(recovered);
  await eventually(() => scheduler.pending.has(run.id));
  assert.equal(scheduler.pending.get(run.id).dueAt, '2026-08-24T04:31:00+08:00');
});

test('STEP-15 browser-session reset pauses prepared work, blocks resume, and explicit rebind preserves no-resend semantics', async () => {
  const { manager } = runHarness();
  let run = await createStarted(manager, { preventDiscard: false });
  run = (await manager.prepareIteration(run.id, run.generation, crypto.randomUUID(), { iteration: 1, message: 'possibly dispatched before shutdown', assistantBaselineSignature: '1:base' })).snapshot;
  const recovered = await manager.recoverBrowserSession();
  let paused = recovered.find((item) => item.id === run.id);
  assert.equal(paused.lifecycleState, 'paused');
  assert.equal(paused.resumeState, 'waiting_response');
  assert.equal(paused.suspensionReason, 'browser_session_reset');
  await assert.rejects(() => manager.resume(paused.id, paused.generation, crypto.randomUUID()), /rebind/i);
  paused = (await manager.rebind(paused.id, paused.generation, crypto.randomUUID(), 77, 5)).snapshot;
  assert.equal(paused.targetTabId, 77);
  assert.notEqual(paused.suspensionReason, 'browser_session_reset');
  const resumed = (await manager.resume(paused.id, paused.generation, crypto.randomUUID())).snapshot;
  const client = new FakeClient();
  new RepeatRunCoordinator(manager, client, new FakeWaiter(), new FakeScheduler()).recover([resumed]);
  await eventually(async () => (await manager.get(run.id))?.lifecycleState === 'completed');
  assert.equal(client.sends.length, 0);
});

test('STEP-15 Side Panel close has no execution authority and reopen reconstructs durable run state', async () => {
  const { manager } = runHarness();
  const coordinator = new RepeatRunCoordinator(manager, new FakeClient(), new FakeWaiter(), new FakeScheduler());
  const run = await createStarted(manager, { preventDiscard: false });
  coordinator.activate(run); // no panel connection exists
  await eventually(async () => (await manager.get(run.id))?.lifecycleState === 'completed');
  const server = new RunRuntimeServer(async () => manager, async () => coordinator);
  const panel = new SidePanelOperationalClient({ sendMessage: (message) => server.handle(message) });
  const runs = await panel.listRuns();
  assert.equal(runs.find((item) => item.id === run.id).lifecycleState, 'completed');
});

test('STEP-15 discard guard survives service-worker reconstruction and restores original autoDiscardable on release', async () => {
  const browser = new FakeTabs();
  browser.add({ id: 10, autoDiscardable: true });
  const storage = new MemoryStorage();
  const first = new AutoDiscardGuardManager(browser, storage);
  await first.acquire('run:one', 10);
  assert.equal((await browser.get(10)).autoDiscardable, false);
  const restarted = new AutoDiscardGuardManager(browser, storage);
  await restarted.ready();
  assert.equal(restarted.ownerTab('run:one'), 10);
  await restarted.release('run:one');
  assert.equal((await browser.get(10)).autoDiscardable, true);
  assert.equal(storage.values.size, 0);
});

test('STEP-15 terminal stop releases persisted discard ownership even while execution is waiting', async () => {
  const { manager } = runHarness();
  const browser = new FakeTabs(); browser.add({ id: 10, windowId: 2, autoDiscardable: true });
  const guards = new AutoDiscardGuardManager(browser, new MemoryStorage());
  const waiter = new DeferredWaiter();
  const coordinator = new RepeatRunCoordinator(manager, new FakeClient(), waiter, new FakeScheduler(), guards);
  const run = await createStarted(manager, { preventDiscard: true });
  coordinator.activate(run);
  await eventually(async () => (await browser.get(10)).autoDiscardable === false);
  const server = new RunRuntimeServer(async () => manager, async () => coordinator);
  const panel = new SidePanelOperationalClient({ sendMessage: (message) => server.handle(message) });
  await panel.stop(await manager.get(run.id));
  await eventually(async () => (await browser.get(10)).autoDiscardable === true);
  waiter.gate.resolve();
});

test('STEP-15 wiring remains explicit-target, event-driven, permission-neutral, and communicates truthful suspension/rebind states', async () => {
  const [background, manager, coordinator, guard, messages, app, config] = await Promise.all([
    text('entrypoints/background.ts'), text('src/runs/manager.ts'), text('src/runs/repeat-coordinator.ts'), text('src/tabs/discard-guard.ts'), text('src/ui/messages.ts'), text('entrypoints/sidepanel/App.vue'), text('wxt.config.ts'),
  ]);
  assert.match(background, /BrowserSessionTracker/);
  assert.match(background, /discardGuards\.ready/);
  assert.match(background, /lifecycle\.start\(\)/);
  assert.match(manager, /reconnecting/);
  assert.match(manager, /recoverBrowserSession/);
  assert.match(manager, /target_rebound/);
  assert.match(coordinator, /suspend\(runId/);
  assert.match(guard, /DISCARD_GUARD_SESSION_KEY/);
  assert.match(messages, /browser_session_reset|browser or extension session restarted/i);
  assert.match(app, /rebindCurrent|rebindTarget/);
  assert.doesNotMatch(config, /['\"]tabs['\"]/);
  for (const source of [background, manager, coordinator, guard]) assert.doesNotMatch(source, /setInterval\s*\(|activeTab/);
});
