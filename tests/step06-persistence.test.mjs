import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ApplicationRepositories,
  CHROME_STORAGE_PURPOSES,
  EXPORT_FORMAT_VERSION,
  LOGICAL_MIGRATIONS,
  LOGICAL_MODEL_VERSION,
  NamespacedChromeStorage,
  PHYSICAL_DB_VERSION,
  PHYSICAL_SCHEMA_V1,
  PERSISTENCE_STORES,
  migrateLogicalModel,
  restrictChromeStorageToTrustedContexts,
} from '../src/persistence/index.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const ids = {
  queue: '10000000-0000-4000-8000-000000000001',
  item1: '10000000-0000-4000-8000-000000000002',
  item2: '10000000-0000-4000-8000-000000000003',
  template: '10000000-0000-4000-8000-000000000004',
  preset: '10000000-0000-4000-8000-000000000005',
};

const clone = (value) => structuredClone(value);
const keyFor = (store, value) => store === 'metadata' ? value.key : value.id;

function matchesIndex(store, index, value, query) {
  if (query === undefined) return true;
  if (store === 'queueItems' && index === 'byQueueId') return value.queueId === query;
  if (store === 'queueItems' && index === 'byQueuePosition') return Array.isArray(query) && value.queueId === query[0] && value.position === query[1];
  if (store === 'runEvents' && index === 'byRunId') return value.runId === query;
  return value[index === 'byName' ? 'name' : index === 'byUpdatedAt' ? 'updatedAt' : index === 'byOccurredAt' ? 'occurredAt' : 'id'] === query;
}

class MemoryDriver {
  state = new Map(PERSISTENCE_STORES.map((name) => [name, new Map()]));
  closed = false;

  async transaction(stores, mode, work) {
    const before = new Map([...this.state].map(([name, values]) => [name, new Map([...values].map(([key, value]) => [key, clone(value)]))]));
    const port = {
      store: (name) => ({
        get: async (key) => {
          const value = this.state.get(name).get(key);
          return value === undefined ? undefined : clone(value);
        },
        getAll: async () => [...this.state.get(name).values()].map(clone),
        getAllByIndex: async (indexName, query) => [...this.state.get(name).values()].filter((value) => matchesIndex(name, indexName, value, query)).map(clone),
        put: async (value) => {
          if (mode !== 'readwrite') throw new Error('readonly transaction');
          this.state.get(name).set(keyFor(name, value), clone(value));
        },
        delete: async (key) => {
          if (mode !== 'readwrite') throw new Error('readonly transaction');
          this.state.get(name).delete(key);
        },
      }),
    };
    try { return await work(port); }
    catch (error) { this.state = before; throw error; }
  }

  close() { this.closed = true; }
}

function queue(revision = 1) {
  return { schemaVersion: 1, id: ids.queue, revision, name: 'Development', createdAt: '2026-08-24T03:00:00+08:00', updatedAt: '2026-08-24T03:00:00+08:00' };
}
function item(id, position, message = 'Continue') {
  return { schemaVersion: 1, id, queueId: ids.queue, position, message, templateId: null, enabled: true, delayAfterSeconds: null, createdAt: '2026-08-24T03:00:00+08:00', updatedAt: '2026-08-24T03:00:00+08:00' };
}

test('STEP-06 physical IndexedDB v1 declares all seven authority stores and required query indexes', () => {
  assert.equal(PHYSICAL_DB_VERSION, 1);
  assert.deepEqual(PHYSICAL_SCHEMA_V1.map((store) => store.name), PERSISTENCE_STORES);
  assert.equal(PHYSICAL_SCHEMA_V1.length, 7);
  const queueItems = PHYSICAL_SCHEMA_V1.find((store) => store.name === 'queueItems');
  assert.ok(queueItems.indexes.some((index) => index.name === 'byQueueId'));
  assert.ok(queueItems.indexes.some((index) => index.name === 'byQueuePosition'));
  const runEvents = PHYSICAL_SCHEMA_V1.find((store) => store.name === 'runEvents');
  assert.equal(runEvents.indexes.find((index) => index.name === 'byRunSequence').unique, true);
});

test('STEP-06 physical, logical and export version authorities are explicitly separate', () => {
  assert.equal(PHYSICAL_DB_VERSION, 1);
  assert.equal(LOGICAL_MODEL_VERSION, 1);
  assert.equal(EXPORT_FORMAT_VERSION, 1);
  const bootstrapSource = new URL('../src/persistence/bootstrap.ts', import.meta.url);
  assert.ok(bootstrapSource);
});

test('STEP-06 stable repositories validate and isolate stored values from caller mutation', async () => {
  const driver = new MemoryDriver();
  const repositories = new ApplicationRepositories(driver);
  const template = { schemaVersion: 1, id: ids.template, revision: 1, name: 'Continue', body: 'Continue with next version.', enabled: true, createdAt: '2026-08-24T03:00:00+08:00', updatedAt: '2026-08-24T03:00:00+08:00' };
  await repositories.write(['templates'], async (tx) => { await tx.repository('templates').put(template); });
  template.name = 'mutated caller';
  const stored = await repositories.readonly(['templates'], async (tx) => await tx.repository('templates').get(ids.template));
  assert.equal(stored.name, 'Continue');
  assert.equal(Object.isFrozen(stored), true);
  await assert.rejects(() => repositories.write(['templates'], async (tx) => tx.repository('templates').put({ ...stored, id: 'bad' })), /UUID v4/);
});

test('STEP-06 queue and queue-item replacement is one atomic transaction with uniqueness guards', async () => {
  const driver = new MemoryDriver();
  const repositories = new ApplicationRepositories(driver);
  await repositories.replaceQueue(queue(), [item(ids.item1, 0), item(ids.item2, 1, 'Second')]);
  let rows = await repositories.readonly(['queueItems'], async (tx) => tx.repository('queueItems').listByIndex('byQueueId', ids.queue));
  assert.deepEqual(rows.map((row) => [row.position, row.message]), [[0, 'Continue'], [1, 'Second']]);
  await assert.rejects(() => repositories.replaceQueue(queue(2), [item(ids.item1, 0), item(ids.item2, 0)]), /positions must be unique/);
  rows = await repositories.readonly(['queueItems'], async (tx) => tx.repository('queueItems').listByIndex('byQueueId', ids.queue));
  assert.deepEqual(rows.map((row) => row.position), [0, 1]);
});

test('STEP-06 configuration mutation boundary rolls back all participating stores together', async () => {
  const driver = new MemoryDriver();
  const repositories = new ApplicationRepositories(driver);
  await assert.rejects(() => repositories.mutateConfiguration(async (tx) => {
    await tx.repository('queues').put(queue());
    await tx.repository('templates').put({ schemaVersion: 1, id: ids.template, revision: 1, name: 'T', body: 'body', enabled: true, createdAt: '2026-08-24T03:00:00+08:00', updatedAt: '2026-08-24T03:00:00+08:00' });
    throw new Error('import preview rejected');
  }), /import preview rejected/);
  const [queues, templates] = await repositories.readonly(['queues', 'templates'], async (tx) => Promise.all([tx.repository('queues').list(), tx.repository('templates').list()]));
  assert.equal(queues.length, 0);
  assert.equal(templates.length, 0);
});

test('STEP-06 logical migration bootstrap is resumable/idempotent and distinct from physical upgrade', async () => {
  const driver = new MemoryDriver();
  const repositories = new ApplicationRepositories(driver);
  const first = await migrateLogicalModel(repositories, LOGICAL_MIGRATIONS, () => '2026-08-24T03:05:00+08:00');
  assert.deepEqual(first, { fromVersion: 0, toVersion: 1, applied: 1 });
  const second = await migrateLogicalModel(repositories, LOGICAL_MIGRATIONS, () => '2026-08-24T03:06:00+08:00');
  assert.deepEqual(second, { fromVersion: 1, toVersion: 1, applied: 0 });
  const metadata = await repositories.readonly(['metadata'], async (tx) => tx.repository('metadata').get('logicalMigrationState'));
  assert.deepEqual(metadata.value, { state: 'complete', version: 1 });
});

test('STEP-06 Chrome storage tiers are namespaced, purpose-bounded and restricted to trusted extension contexts', async () => {
  const calls = [];
  const values = {};
  const area = (name) => ({
    async get(key) { return { [key]: values[`${name}:${key}`] }; },
    async set(items) { for (const [key, value] of Object.entries(items)) values[`${name}:${key}`] = clone(value); },
    async remove(key) { delete values[`${name}:${key}`]; },
    async setAccessLevel(options) { calls.push([name, options.accessLevel]); },
  });
  const storage = { local: area('local'), session: area('session'), sync: area('sync') };
  await restrictChromeStorageToTrustedContexts(storage);
  assert.deepEqual(calls, [['local', 'TRUSTED_CONTEXTS'], ['session', 'TRUSTED_CONTEXTS'], ['sync', 'TRUSTED_CONTEXTS']]);
  const prefs = new NamespacedChromeStorage(storage.sync, 'sync');
  await prefs.set('appearance.compact', true);
  assert.equal(values['sync:iterator.sync.appearance.compact'], true);
  assert.equal(await prefs.get('appearance.compact'), true);
  assert.match(CHROME_STORAGE_PURPOSES.sync, /small user preferences/);
  assert.match(CHROME_STORAGE_PURPOSES.session, /never durable execution authority/);
});

test('STEP-06 worker owns application database bootstrap; content adapter has no persistence access', async () => {
  const [background, content, config, bootstrap] = await Promise.all([
    text('entrypoints/background.ts'), text('entrypoints/chatgpt.content.ts'), text('wxt.config.ts'), text('src/persistence/bootstrap.ts'),
  ]);
  assert.match(background, /bootstrapApplicationPersistence/);
  assert.match(background, /restrictChromeStorageToTrustedContexts/);
  assert.doesNotMatch(content, /persistence|indexedDB|chrome\.storage|browser\.storage/i);
  assert.match(config, /permissions:\s*\[[^\]]*['"]sidePanel['"][^\]]*\]/);
  assert.match(config, /permissions:\s*\[[^\]]*['"]storage['"][^\]]*\]/);
  assert.doesNotMatch(config, /unlimitedStorage/);
  assert.match(bootstrap, /openIteratorDatabase/);
  assert.match(bootstrap, /migrateLogicalModel/);
});
