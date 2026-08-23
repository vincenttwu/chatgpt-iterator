import type { PersistenceStoreName, StoreRecord } from './types.ts';

export type TransactionMode = 'readonly' | 'readwrite';

export interface StorePort<S extends PersistenceStoreName> {
  get(key: IDBValidKey): Promise<StoreRecord<S> | undefined>;
  getAll(): Promise<StoreRecord<S>[]>;
  getAllByIndex(indexName: string, query?: IDBValidKey | IDBKeyRange): Promise<StoreRecord<S>[]>;
  put(value: StoreRecord<S>): Promise<void>;
  delete(key: IDBValidKey): Promise<void>;
}

export interface TransactionPort {
  store<S extends PersistenceStoreName>(name: S): StorePort<S>;
}

export interface PersistenceDriver {
  transaction<T>(stores: readonly PersistenceStoreName[], mode: TransactionMode, work: (transaction: TransactionPort) => Promise<T>): Promise<T>;
  close(): void;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

class IndexedDbStorePort<S extends PersistenceStoreName> implements StorePort<S> {
  readonly #store: IDBObjectStore;
  constructor(store: IDBObjectStore) { this.#store = store; }

  async get(key: IDBValidKey): Promise<StoreRecord<S> | undefined> {
    return await requestAsPromise(this.#store.get(key)) as StoreRecord<S> | undefined;
  }
  async getAll(): Promise<StoreRecord<S>[]> {
    return await requestAsPromise(this.#store.getAll()) as StoreRecord<S>[];
  }
  async getAllByIndex(indexName: string, query?: IDBValidKey | IDBKeyRange): Promise<StoreRecord<S>[]> {
    const index = this.#store.index(indexName);
    return await requestAsPromise(index.getAll(query)) as StoreRecord<S>[];
  }
  async put(value: StoreRecord<S>): Promise<void> { await requestAsPromise(this.#store.put(value)); }
  async delete(key: IDBValidKey): Promise<void> { await requestAsPromise(this.#store.delete(key)); }
}

class IndexedDbTransactionPort implements TransactionPort {
  readonly #transaction: IDBTransaction;
  constructor(transaction: IDBTransaction) { this.#transaction = transaction; }
  store<S extends PersistenceStoreName>(name: S): StorePort<S> {
    return new IndexedDbStorePort<S>(this.#transaction.objectStore(name));
  }
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

export class IndexedDbPersistenceDriver implements PersistenceDriver {
  readonly #database: IDBDatabase;
  constructor(database: IDBDatabase) { this.#database = database; }

  async transaction<T>(stores: readonly PersistenceStoreName[], mode: TransactionMode, work: (transaction: TransactionPort) => Promise<T>): Promise<T> {
    if (stores.length === 0) throw new TypeError('transaction requires at least one store');
    const transaction = this.#database.transaction([...stores], mode);
    const completion = transactionDone(transaction);
    try {
      const result = await work(new IndexedDbTransactionPort(transaction));
      await completion;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction may already be inactive */ }
      try { await completion; } catch { /* preserve original failure */ }
      throw error;
    }
  }

  close(): void { this.#database.close(); }
}
