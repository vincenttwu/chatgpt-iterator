import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequest, requireMessageEnvelope } from '../src/core/index.ts';
import { ApplicationRepositories, PERSISTENCE_STORES } from '../src/persistence/index.ts';
import { DurableRunManager, DurableRunRepository, RUN_EVENT_HISTORY_LIMIT, RUN_RUNTIME_OPERATIONS } from '../src/runs/index.ts';
import { RunRuntimeServer } from '../src/runtime/index.ts';

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
  log = [];
  async transaction(stores, mode, work) {
    const before = new Map([...this.state].map(([name, values]) => [name, new Map([...values].map(([key, value]) => [key, clone(value)]))]));
    const port = {
      store: (name) => ({
        get: async (key) => { const value = this.state.get(name).get(key); return value === undefined ? undefined : clone(value); },
        getAll: async () => [...this.state.get(name).values()].map(clone),
        getAllByIndex: async (indexName, query) => [...this.state.get(name).values()].filter((value) => matchesIndex(name, indexName, value, query)).map(clone),
        put: async (value) => { if (mode !== 'readwrite') throw new Error('readonly'); this.state.get(name).set(keyFor(name, value), clone(value)); },
        delete: async (key) => { if (mode !== 'readwrite') throw new Error('readonly'); this.state.get(name).delete(key); },
      }),
    };
    try {
      const result = await work(port);
      this.log.push(['commit', [...stores]]);
      return result;
    } catch (error) {
      this.state = before;
      this.log.push(['rollback', [...stores]]);
      throw error;
    }
  }
  close() {}
}

function harness() {
  const driver = new MemoryDriver();
  const repositories = new ApplicationRepositories(driver);
  let tick = 0;
  const base = Date.parse('2026-08-24T03:20:00+08:00');
  const now = () => new Date(base + (tick++ * 1000)).toISOString();
  const repository = new DurableRunRepository(repositories, { now, id: () => crypto.randomUUID() });
  const manager = new DurableRunManager(repository);
  return { driver, repositories, repository, manager };
}

async function created(manager) {
  return (await manager.create({ targetTabId: 10, targetWindowId: 2, commandId: crypto.randomUUID() })).snapshot;
}

function command(operation, sequence, payload = {}, intent = 'command') {
  return createRequest({ requestSequence: sequence, intent, source: 'sidepanel', target: 'background', operation, payload });
}

test('STEP-07 create/start transitions persist run and event before publishing observable state', async () => {
  const { driver, repository, manager } = harness();
  const order = [];
  manager.subscribe((snapshot) => order.push(['publish', snapshot.lifecycleState, driver.log.at(-1)?.[0]]));
  const ready = await created(manager);
  assert.deepEqual([ready.lifecycleState, ready.generation], ['ready', 1]);
  const running = (await manager.start(ready.id, 1, crypto.randomUUID())).snapshot;
  assert.deepEqual([running.lifecycleState, running.generation], ['running', 2]);
  assert.equal(order.every((entry) => entry[2] === 'commit'), true);
  const events = await repository.events(ready.id);
  assert.deepEqual(events.map((event) => [event.sequence, event.eventType]), [[0, 'created'], [1, 'started']]);
});

test('STEP-07 generation fences reject stale async completions and exact command replay is idempotent', async () => {
  const { repository, manager } = harness();
  const ready = await created(manager);
  const commandId = crypto.randomUUID();
  const first = await manager.start(ready.id, 1, commandId);
  const replay = await manager.start(ready.id, 1, commandId);
  assert.equal(replay.idempotent, true);
  assert.deepEqual(replay.snapshot, first.snapshot);
  await assert.rejects(() => manager.setActiveState(ready.id, 1, crypto.randomUUID(), 'waiting_response'), /generation is 2, expected 1/);
  assert.equal((await repository.events(ready.id)).length, 2);
});

test('STEP-07 pause/resume/stop preserve resumable authority and terminal runs reject later mutation', async () => {
  const { manager } = harness();
  const ready = await created(manager);
  let run = (await manager.start(ready.id, ready.generation, crypto.randomUUID())).snapshot;
  run = (await manager.setActiveState(run.id, run.generation, crypto.randomUUID(), 'waiting_response')).snapshot;
  run = (await manager.pause(run.id, run.generation, crypto.randomUUID())).snapshot;
  assert.deepEqual([run.lifecycleState, run.resumeState], ['paused', 'waiting_response']);
  run = (await manager.resume(run.id, run.generation, crypto.randomUUID())).snapshot;
  assert.deepEqual([run.lifecycleState, run.resumeState], ['waiting_response', null]);
  run = (await manager.stop(run.id, run.generation, crypto.randomUUID())).snapshot;
  assert.equal(run.lifecycleState, 'stopped');
  await assert.rejects(() => manager.pause(run.id, run.generation, crypto.randomUUID()), /terminal|cannot pause/);
});

test('STEP-07 worker recovery advances generation of every nonterminal run and fences pre-restart work', async () => {
  const { manager } = harness();
  const ready = await created(manager);
  const running = (await manager.start(ready.id, 1, crypto.randomUUID())).snapshot;
  const recovered = await manager.recoverWorker();
  assert.equal(recovered.length, 1);
  assert.deepEqual([recovered[0].lifecycleState, recovered[0].generation], ['running', running.generation + 1]);
  await assert.rejects(() => manager.setActiveState(running.id, running.generation, crypto.randomUUID(), 'waiting_response'), /generation is 3, expected 2/);
});

test('STEP-07 tab lifecycle reconciles active runs through frozen/discarded states and explicit close failure', async () => {
  const { manager } = harness();
  const ready = await created(manager);
  let run = (await manager.start(ready.id, 1, crypto.randomUUID())).snapshot;
  const snap = (state, termination = null) => ({ schemaVersion: 1, revision: 1, targets: state === null ? [] : [{ schemaVersion: 1, tabId: 10, windowId: 2, active: false, title: null, url: 'https://chatgpt.com/c/x', browserStatus: 'complete', lifecycleState: state, autoDiscardable: true, contentConnected: true, adapterReady: true, adapterBusy: false, pageAlert: null }], binding: null, lastTermination: termination });
  await manager.reconcileTabs(snap('frozen'));
  run = await manager.get(run.id);
  assert.deepEqual([run.lifecycleState, run.resumeState], ['frozen', 'running']);
  await manager.reconcileTabs(snap('ready'));
  run = await manager.get(run.id);
  assert.deepEqual([run.lifecycleState, run.resumeState], ['running', null]);
  await manager.reconcileTabs(snap('discarded'));
  run = await manager.get(run.id);
  assert.equal(run.lifecycleState, 'discarded');
  await manager.reconcileTabs(snap(null, { schemaVersion: 1, tabId: 10, windowId: 2, lifecycleState: 'closed', reason: 'closed', occurredAt: '2026-08-24T03:30:00+08:00' }));
  run = await manager.get(run.id);
  assert.deepEqual([run.lifecycleState, run.failure.code], ['failed', 'closed']);
});

test('STEP-07 run events are structured and bounded while sequence remains monotonic', async () => {
  const { repository, manager } = harness();
  const ready = await created(manager);
  let run = (await manager.start(ready.id, 1, crypto.randomUUID())).snapshot;
  const states = ['waiting_response', 'waiting_delay', 'running'];
  for (let i = 0; i < RUN_EVENT_HISTORY_LIMIT + 8; i++) {
    run = (await manager.setActiveState(run.id, run.generation, crypto.randomUUID(), states[i % states.length])).snapshot;
  }
  const events = await repository.events(run.id);
  assert.equal(events.length, RUN_EVENT_HISTORY_LIMIT);
  assert.equal(events.at(-1).sequence > events[0].sequence, true);
  assert.equal(events.every((event) => JSON.stringify(event.payload).length <= 4096), true);
});

test('STEP-07 runtime command surface is correlated/idempotent and does not require Side Panel lifetime ownership', async () => {
  const { manager } = harness();
  const server = new RunRuntimeServer(async () => manager);
  const create = command(RUN_RUNTIME_OPERATIONS.create, 1, { targetTabId: 10, targetWindowId: 2 });
  const first = requireMessageEnvelope(await server.handle(create));
  const replay = requireMessageEnvelope(await server.handle(create));
  assert.equal(first.outcome.ok && first.outcome.value.run.lifecycleState, 'ready');
  assert.equal(replay.outcome.ok && replay.outcome.value.idempotent, true);
  const run = first.outcome.ok && first.outcome.value.run;
  const start = command(RUN_RUNTIME_OPERATIONS.start, 2, { runId: run.id, expectedGeneration: run.generation });
  const started = requireMessageEnvelope(await server.handle(start));
  assert.equal(started.outcome.ok && started.outcome.value.run.lifecycleState, 'running');
  const list = command(RUN_RUNTIME_OPERATIONS.list, 3, {}, 'query');
  const listed = requireMessageEnvelope(await server.handle(list));
  assert.equal(listed.outcome.ok && listed.outcome.value.length, 1);
});

test('STEP-07 source wiring keeps durable run authority in background and panel disconnect cannot stop it', async () => {
  const [background, router, runServer, panel, types] = await Promise.all([
    text('entrypoints/background.ts'), text('src/runtime/message-router.ts'), text('src/runtime/run-runtime-server.ts'), text('src/control-plane/panel-client.ts'), text('src/runs/types.ts'),
  ]);
  assert.match(background, /DurableRunManager/);
  assert.match(background, /recoverWorker/);
  assert.match(background, /reconcileTabs/);
  assert.match(router, /RUN_RUNTIME_OPERATIONS/);
  assert.match(runServer, /run\.create/);
  assert.match(types, /waiting_response/);
  assert.match(types, /waiting_delay/);
  assert.match(types, /frozen/);
  assert.match(types, /discarded/);
  assert.doesNotMatch(panel, /RUN_RUNTIME_OPERATIONS|run\.stop/);
  assert.doesNotMatch(background, /onDisconnect[\s\S]{0,300}(run\.stop|\.stop\()/);
});
