import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ContractError, ERROR_CODES } from '../src/core/index.ts';
import { ApplicationRepositories, PERSISTENCE_STORES } from '../src/persistence/index.ts';
import { RepeatMessageSource, renderMessageTemplate } from '../src/messages/index.ts';
import {
  ChatGptObservationHub,
  DurableRunManager,
  DurableRunRepository,
  DurableRunScheduler,
  EventDrivenChatGptWaiter,
  RepeatRunCoordinator,
} from '../src/runs/index.ts';

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
  const driver = new MemoryDriver();
  const repositories = new ApplicationRepositories(driver);
  let tick = 0;
  const base = Date.parse('2026-08-24T03:40:00+08:00');
  const now = () => new Date(base + tick++ * 1000).toISOString();
  const repository = new DurableRunRepository(repositories, { now, id: () => crypto.randomUUID() });
  return { manager: new DurableRunManager(repository), repository };
}

function adapterSnapshot(patch = {}) {
  return {
    schemaVersion: 1,
    ready: true,
    busy: false,
    composerPresent: true,
    composerDraft: '',
    sendAvailable: true,
    continueAvailable: false,
    stopAvailable: false,
    assistantSignature: '1:4:done',
    assistantMessageCount: 1,
    pageAlert: null,
    ...patch,
  };
}

class FakeClient {
  sends = [];
  scrolls = [];
  continues = 0;
  snapshots = [adapterSnapshot({ assistantSignature: '1:4:base' })];
  async snapshot() { return this.snapshots.at(-1); }
  async send(tabId, message, baseline) { this.sends.push({ tabId, message, baseline }); return { schemaVersion: 1, status: 'sent', assistantBaselineSignature: baseline }; }
  async scrollToBottom(tabId) { this.scrolls.push(tabId); }
  async continueResponse() { this.continues += 1; return { schemaVersion: 1, clicked: true }; }
}

class FakeWaiter {
  idle = adapterSnapshot({ assistantSignature: '1:4:base' });
  response = adapterSnapshot({ assistantSignature: '2:8:complete' });
  responseError = null;
  idleGate = null;
  async waitUntilIdle(_tabId, cancelled) {
    if (this.idleGate) await this.idleGate.promise;
    if (cancelled()) throw new ContractError(ERROR_CODES.staleRequest, 'cancelled');
    return this.idle;
  }
  async waitForResponse(_tabId, _baseline, { cancelled }) {
    if (cancelled()) throw new ContractError(ERROR_CODES.staleRequest, 'cancelled');
    if (this.responseError) throw this.responseError;
    return this.response;
  }
}

class FakeScheduler {
  pending = new Map();
  modes = [];
  async schedule(runId, generation, dueAt, callback) { this.pending.set(runId, { generation, dueAt, callback }); this.modes.push('scheduled'); return 'short_timer'; }
  async cancel(runId) { this.pending.delete(runId); }
  fire(runId) { const pending = this.pending.get(runId); this.pending.delete(runId); pending?.callback(); }
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

async function eventually(check, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition not reached');
}

async function createStarted(manager, options = {}) {
  let run = (await manager.create({
    targetTabId: 10,
    targetWindowId: 2,
    commandId: crypto.randomUUID(),
    messageTemplate: options.messageTemplate ?? 'Iteration {iteration}/{total}; remaining={remaining}; at={timestamp}',
    totalIterations: options.totalIterations ?? 2,
    delaySeconds: options.delaySeconds ?? 5,
    autoContinue: options.autoContinue ?? true,
    autoScroll: options.autoScroll ?? true,
  })).snapshot;
  return (await manager.start(run.id, run.generation, crypto.randomUUID())).snapshot;
}

test('STEP-08 RepeatMessageSource renders the bounded standard placeholder vocabulary', () => {
  const context = { iteration: 2, total: 5, remaining: 3, timestamp: '2026-08-24T03:40:00+08:00' };
  const source = new RepeatMessageSource('Run {iteration}/{total} ({remaining}) at {timestamp}');
  assert.equal(source.next(context).content, 'Run 2/5 (3) at 2026-08-24T03:40:00+08:00');
  assert.throws(() => renderMessageTemplate('bad {script}', context), /unsupported message template token/);
});

test('STEP-08 nominal repeat persists prepared response wait, schedules delay, then completes without panel ownership', async () => {
  const { manager } = runHarness();
  const client = new FakeClient();
  const waiter = new FakeWaiter();
  const scheduler = new FakeScheduler();
  const coordinator = new RepeatRunCoordinator(manager, client, waiter, scheduler);
  const started = await createStarted(manager, { totalIterations: 2 });
  coordinator.activate(started);
  const waiting = await eventually(async () => { const run = await manager.get(started.id); return run?.lifecycleState === 'waiting_delay' ? run : null; });
  assert.equal(waiting.execution.completedIterations, 1);
  assert.equal(client.sends.length, 1);
  assert.match(client.sends[0].message, /Iteration 1\/2; remaining=1/);
  assert.equal(client.sends[0].baseline, '1:4:base');
  assert.equal(typeof waiting.execution.nextDueAt, 'string');
  scheduler.fire(started.id);
  const completed = await eventually(async () => { const run = await manager.get(started.id); return run?.lifecycleState === 'completed' ? run : null; });
  assert.equal(completed.execution.completedIterations, 2);
  assert.equal(client.sends.length, 2);
});

test('STEP-08 pause/resume and stop cancel scheduled execution without consuming another message', async () => {
  const { manager } = runHarness();
  const client = new FakeClient();
  const waiter = new FakeWaiter();
  const scheduler = new FakeScheduler();
  const coordinator = new RepeatRunCoordinator(manager, client, waiter, scheduler);
  const started = await createStarted(manager, { totalIterations: 3 });
  coordinator.activate(started);
  let run = await eventually(async () => { const value = await manager.get(started.id); return value?.lifecycleState === 'waiting_delay' ? value : null; });
  await coordinator.cancel(run.id);
  run = (await manager.pause(run.id, run.generation, crypto.randomUUID())).snapshot;
  assert.equal(run.resumeState, 'waiting_delay');
  scheduler.fire(run.id);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(client.sends.length, 1);
  run = (await manager.resume(run.id, run.generation, crypto.randomUUID())).snapshot;
  coordinator.activate(run);
  await eventually(() => scheduler.pending.has(run.id));
  scheduler.fire(run.id);
  run = await eventually(async () => { const value = await manager.get(started.id); return value?.execution.completedIterations === 2 ? value : null; });
  await coordinator.cancel(run.id);
  run = (await manager.stop(run.id, run.generation, crypto.randomUUID())).snapshot;
  scheduler.fire(run.id);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(run.lifecycleState, 'stopped');
  assert.equal(client.sends.length, 2);
});

test('STEP-08 response timeout fails the durable run instead of polling or silently advancing', async () => {
  const { manager } = runHarness();
  const client = new FakeClient();
  const waiter = new FakeWaiter();
  waiter.responseError = new ContractError(ERROR_CODES.unavailable, 'response timeout');
  const coordinator = new RepeatRunCoordinator(manager, client, waiter, new FakeScheduler());
  const started = await createStarted(manager, { totalIterations: 1 });
  coordinator.activate(started);
  const failed = await eventually(async () => { const run = await manager.get(started.id); return run?.lifecycleState === 'failed' ? run : null; });
  assert.equal(failed.failure.code, ERROR_CODES.unavailable);
  assert.match(failed.failure.message, /timeout/);
});

test('STEP-08 stale-run cancellation fences a delayed idle wait before any send', async () => {
  const { manager } = runHarness();
  const client = new FakeClient();
  const waiter = new FakeWaiter();
  waiter.idleGate = deferred();
  const coordinator = new RepeatRunCoordinator(manager, client, waiter, new FakeScheduler());
  const started = await createStarted(manager, { totalIterations: 1 });
  coordinator.activate(started);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await coordinator.cancel(started.id);
  const paused = (await manager.pause(started.id, started.generation, crypto.randomUUID())).snapshot;
  waiter.idleGate.resolve();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await manager.get(started.id)).lifecycleState, 'paused');
  assert.equal(paused.resumeState, 'running');
  assert.equal(client.sends.length, 0);
});

test('STEP-08 worker recovery from prepared waiting_response never blindly resends the active message', async () => {
  const { manager } = runHarness();
  const client = new FakeClient();
  const waiter = new FakeWaiter();
  const coordinator = new RepeatRunCoordinator(manager, client, waiter, new FakeScheduler());
  let run = await createStarted(manager, { totalIterations: 1 });
  run = (await manager.prepareIteration(run.id, run.generation, crypto.randomUUID(), { iteration: 1, message: 'already dispatched or conservatively assumed', assistantBaselineSignature: '1:4:base' })).snapshot;
  const recovered = await manager.recoverWorker();
  coordinator.recover(recovered);
  const completed = await eventually(async () => { const value = await manager.get(run.id); return value?.lifecycleState === 'completed' ? value : null; });
  assert.equal(completed.execution.completedIterations, 1);
  assert.equal(client.sends.length, 0);
});

test('STEP-08 scheduler uses short timers below 30s and alarms for longer/recovery delays', async () => {
  const alarms = { created: [], cleared: [], listener: null, create(name, info) { this.created.push([name, info]); }, clear(name) { this.cleared.push(name); return true; }, onAlarm: { addListener: (listener) => { alarms.listener = listener; } } };
  const timers = { entries: [], setTimeout(callback, delayMs) { const handle = { callback, delayMs }; this.entries.push(handle); return handle; }, clearTimeout() {} };
  const scheduler = new DurableRunScheduler(alarms, () => 1_000_000, timers);
  const id = crypto.randomUUID();
  assert.equal(await scheduler.schedule(id, 2, new Date(1_000_000 + 29_000).toISOString(), () => {}), 'short_timer');
  assert.equal(timers.entries.at(-1).delayMs, 29_000);
  assert.equal(await scheduler.schedule(id, 3, new Date(1_000_000 + 30_000).toISOString(), () => {}), 'alarm');
  assert.equal(alarms.created.length, 1);
  assert.equal(alarms.created[0][1].when, 1_030_000);
});

test('STEP-08 event-driven waiter clicks Continue from semantic observations and completes on a stability deadline', async () => {
  const hub = new ChatGptObservationHub();
  const client = new FakeClient();
  client.snapshots = [adapterSnapshot({ assistantSignature: '1:4:base', busy: true, sendAvailable: false })];
  const waiter = new EventDrivenChatGptWaiter(client, hub, () => Date.now(), { responseStartTimeoutMs: 100, responseStableMs: 10 });
  const pending = waiter.waitForResponse(10, '1:4:base', { autoContinue: true, cancelled: () => false });
  hub.note(10, adapterSnapshot({ assistantSignature: '1:7:partial', continueAvailable: true, busy: false }));
  await eventually(() => client.continues === 1);
  hub.note(10, adapterSnapshot({ assistantSignature: '1:12:final', busy: false, continueAvailable: false }));
  const result = await pending;
  assert.equal(result.assistantSignature, '1:12:final');
});

test('STEP-08 source wiring is event-driven, uses alarms only for coarse scheduling, and adds no polling loop', async () => {
  const [background, content, scheduler, waiter, coordinator, manifest, server] = await Promise.all([
    text('entrypoints/background.ts'), text('entrypoints/chatgpt.content.ts'), text('src/runs/scheduler.ts'), text('src/runs/response-waiter.ts'), text('src/runs/repeat-coordinator.ts'), text('wxt.config.ts'), text('src/chatgpt/server.ts'),
  ]);
  assert.match(background, /RepeatRunCoordinator/);
  assert.match(background, /DurableRunScheduler/);
  assert.match(content, /assistantSignature/);
  assert.match(scheduler, /RUN_SHORT_DELAY_THRESHOLD_MS/);
  assert.match(scheduler, /alarms\.create|#alarms\.create/);
  assert.match(waiter, /ResponseCompletionTracker/);
  assert.match(coordinator, /prepareIteration/);
  assert.match(server, /expectedAssistantBaselineSignature/);
  assert.match(manifest, /'alarms'/);
  for (const source of [background, content, scheduler, waiter, coordinator]) {
    assert.doesNotMatch(source, /setInterval\s*\(/);
    assert.doesNotMatch(source, /400\s*\)|POLL|pollInterval/i);
  }
});
