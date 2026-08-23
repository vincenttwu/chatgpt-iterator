import { PHYSICAL_DB_VERSION, PERSISTENCE_DB_NAME } from './versions.ts';
import type { PersistenceStoreName } from './types.ts';

export interface IndexDefinition {
  readonly name: string;
  readonly keyPath: string | readonly string[];
  readonly unique?: boolean;
}

export interface StoreDefinition {
  readonly name: PersistenceStoreName;
  readonly keyPath: string;
  readonly indexes: readonly IndexDefinition[];
}

export const PHYSICAL_SCHEMA_V1: readonly StoreDefinition[] = Object.freeze([
  { name: 'metadata', keyPath: 'key', indexes: [{ name: 'byUpdatedAt', keyPath: 'updatedAt' }] },
  { name: 'templates', keyPath: 'id', indexes: [{ name: 'byName', keyPath: 'name' }, { name: 'byUpdatedAt', keyPath: 'updatedAt' }] },
  { name: 'presets', keyPath: 'id', indexes: [{ name: 'byName', keyPath: 'name' }, { name: 'byUpdatedAt', keyPath: 'updatedAt' }] },
  { name: 'queues', keyPath: 'id', indexes: [{ name: 'byName', keyPath: 'name' }, { name: 'byUpdatedAt', keyPath: 'updatedAt' }] },
  { name: 'queueItems', keyPath: 'id', indexes: [{ name: 'byQueueId', keyPath: 'queueId' }, { name: 'byQueuePosition', keyPath: ['queueId', 'position'] }] },
  { name: 'runs', keyPath: 'id', indexes: [{ name: 'byUpdatedAt', keyPath: 'updatedAt' }] },
  { name: 'runEvents', keyPath: 'id', indexes: [{ name: 'byRunId', keyPath: 'runId' }, { name: 'byRunSequence', keyPath: ['runId', 'sequence'], unique: true }, { name: 'byOccurredAt', keyPath: 'occurredAt' }] },
]);

export interface IndexedDbFactoryLike {
  open(name: string, version?: number): IDBOpenDBRequest;
}

function ensureIndex(store: IDBObjectStore, definition: IndexDefinition): void {
  if (store.indexNames.contains(definition.name)) return;
  store.createIndex(definition.name, definition.keyPath as string | string[], { unique: definition.unique ?? false });
}

export function applyPhysicalSchemaV1(database: IDBDatabase, transaction: IDBTransaction): void {
  for (const definition of PHYSICAL_SCHEMA_V1) {
    const store = database.objectStoreNames.contains(definition.name)
      ? transaction.objectStore(definition.name)
      : database.createObjectStore(definition.name, { keyPath: definition.keyPath });
    for (const index of definition.indexes) ensureIndex(store, index);
  }
}

export function openIteratorDatabase(factory: IndexedDbFactoryLike = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(PERSISTENCE_DB_NAME, PHYSICAL_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      if (transaction === null) throw new Error('IndexedDB upgrade transaction is unavailable');
      if (event.oldVersion < 1) applyPhysicalSchemaV1(database, transaction);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another extension context'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}
