import type { JsonObject } from '../core/types.ts';
import { cloneJsonValue } from '../core/json.ts';
import type { PersistenceDriver, StorePort, TransactionPort } from './driver.ts';
import type {
  MetadataRecord,
  PersistenceStoreName,
  QueueItemRecord,
  QueueRecord,
  StoreRecord,
  StoreRecordMap,
} from './types.ts';
import { freezePersistenceRecord, requireEntityId, requireRevision, requireSequence } from './types.ts';

function keyFor<S extends PersistenceStoreName>(name: S, record: StoreRecord<S>): IDBValidKey {
  return (name === 'metadata' ? (record as MetadataRecord).key : (record as StoreRecordMap[Exclude<S, 'metadata'>] & { readonly id: string }).id) as IDBValidKey;
}

function validateRecord<S extends PersistenceStoreName>(name: S, record: StoreRecord<S>): StoreRecord<S> {
  if (name === 'metadata') {
    const metadata = record as MetadataRecord;
    if (metadata.key.trim().length === 0) throw new TypeError('metadata key must not be blank');
    return freezePersistenceRecord(cloneJsonValue(metadata)) as StoreRecord<S>;
  }
  const entity = record as StoreRecord<S> & { readonly id: string; readonly schemaVersion: number };
  requireEntityId(entity.id, `${name} id`);
  if (entity.schemaVersion !== 1) throw new TypeError(`${name} schemaVersion must be 1`);
  if ('revision' in entity) requireRevision((entity as { readonly revision: unknown }).revision, `${name} revision`);
  if (name === 'runEvents') requireSequence((entity as StoreRecordMap['runEvents']).sequence, 'run event sequence');
  return freezePersistenceRecord(cloneJsonValue(entity as unknown as JsonObject)) as StoreRecord<S>;
}

export class Repository<S extends PersistenceStoreName> {
  readonly #name: S;
  readonly #store: StorePort<S>;
  constructor(name: S, store: StorePort<S>) { this.#name = name; this.#store = store; }

  async get(key: IDBValidKey): Promise<StoreRecord<S> | undefined> {
    const value = await this.#store.get(key);
    return value === undefined ? undefined : validateRecord(this.#name, value);
  }
  async list(): Promise<StoreRecord<S>[]> {
    const values = await this.#store.getAll();
    return values.map((value) => validateRecord(this.#name, value));
  }
  async put(record: StoreRecord<S>): Promise<StoreRecord<S>> {
    const valid = validateRecord(this.#name, record);
    await this.#store.put(valid);
    return valid;
  }
  async delete(key: IDBValidKey): Promise<void> { await this.#store.delete(key); }
  async listByIndex(indexName: string, query?: IDBValidKey | IDBKeyRange): Promise<StoreRecord<S>[]> {
    const values = await this.#store.getAllByIndex(indexName, query);
    return values.map((value) => validateRecord(this.#name, value));
  }
  key(record: StoreRecord<S>): IDBValidKey { return keyFor(this.#name, record); }
}

export class RepositoryTransaction {
  readonly #transaction: TransactionPort;
  constructor(transaction: TransactionPort) { this.#transaction = transaction; }
  repository<S extends PersistenceStoreName>(name: S): Repository<S> { return new Repository(name, this.#transaction.store(name)); }
}

export class ApplicationRepositories {
  readonly #driver: PersistenceDriver;
  constructor(driver: PersistenceDriver) { this.#driver = driver; }

  async readonly<S extends PersistenceStoreName, T>(stores: readonly S[], work: (transaction: RepositoryTransaction) => Promise<T>): Promise<T> {
    return await this.#driver.transaction(stores, 'readonly', async (transaction) => await work(new RepositoryTransaction(transaction)));
  }

  async write<S extends PersistenceStoreName, T>(stores: readonly S[], work: (transaction: RepositoryTransaction) => Promise<T>): Promise<T> {
    return await this.#driver.transaction(stores, 'readwrite', async (transaction) => await work(new RepositoryTransaction(transaction)));
  }

  async replaceQueue(queue: QueueRecord, items: readonly QueueItemRecord[]): Promise<void> {
    requireEntityId(queue.id, 'queue id');
    const sorted = [...items].sort((a, b) => a.position - b.position);
    const positions = new Set<number>();
    for (const item of sorted) {
      requireEntityId(item.id, 'queue item id');
      if (item.queueId !== queue.id) throw new TypeError('queue item queueId must match queue id');
      requireSequence(item.position, 'queue item position');
      if (positions.has(item.position)) throw new TypeError('queue item positions must be unique within a queue');
      positions.add(item.position);
    }
    await this.write(['queues', 'queueItems'], async (transaction) => {
      const queues = transaction.repository('queues');
      const queueItems = transaction.repository('queueItems');
      await queues.put(queue);
      const existing = await queueItems.listByIndex('byQueueId', queue.id);
      for (const row of existing) await queueItems.delete(row.id);
      for (const item of sorted) await queueItems.put(item);
    });
  }

  async mutateConfiguration<T>(work: (transaction: RepositoryTransaction) => Promise<T>): Promise<T> {
    return await this.write(['metadata', 'templates', 'presets', 'queues', 'queueItems'], work);
  }

  close(): void { this.#driver.close(); }
}
