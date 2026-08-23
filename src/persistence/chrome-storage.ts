import type { JsonValue } from '../core/types.ts';
import { assertJsonSafe, cloneJsonValue } from '../core/json.ts';

export type ChromeStorageTier = 'local' | 'session' | 'sync';
export type StorageAccessLevel = 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS';

export interface ChromeStorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  setAccessLevel?(options: { accessLevel: StorageAccessLevel }): Promise<void>;
}

export interface ChromeStorageLike {
  local: ChromeStorageAreaLike;
  session: ChromeStorageAreaLike;
  sync: ChromeStorageAreaLike;
}

export const CHROME_STORAGE_PURPOSES = Object.freeze({
  local: 'device-local bootstrap and UI preferences only; canonical definitions/runs stay in IndexedDB',
  session: 'browser-session coordination and reconnect hints only; never durable execution authority',
  sync: 'small user preferences suitable for Chrome Sync; never queues, history, messages, or sensitive run data',
});

const NAMESPACES: Record<ChromeStorageTier, string> = {
  local: 'iterator.local',
  session: 'iterator.session',
  sync: 'iterator.sync',
};

export class NamespacedChromeStorage {
  readonly #area: ChromeStorageAreaLike;
  readonly #prefix: string;
  constructor(area: ChromeStorageAreaLike, tier: ChromeStorageTier) {
    this.#area = area;
    this.#prefix = `${NAMESPACES[tier]}.`;
  }

  #key(key: string): string {
    if (key.trim().length === 0 || key.includes('..')) throw new TypeError('storage key must be a non-blank scoped key');
    return `${this.#prefix}${key}`;
  }

  async get(key: string): Promise<JsonValue | undefined> {
    const scoped = this.#key(key);
    const result = await this.#area.get(scoped);
    const value = result[scoped];
    if (value === undefined) return undefined;
    assertJsonSafe(value);
    return cloneJsonValue(value);
  }

  async set(key: string, value: JsonValue): Promise<void> {
    assertJsonSafe(value);
    await this.#area.set({ [this.#key(key)]: cloneJsonValue(value) });
  }

  async remove(key: string): Promise<void> { await this.#area.remove(this.#key(key)); }
}

export function createChromeStorageTiers(storage: ChromeStorageLike): Record<ChromeStorageTier, NamespacedChromeStorage> {
  return {
    local: new NamespacedChromeStorage(storage.local, 'local'),
    session: new NamespacedChromeStorage(storage.session, 'session'),
    sync: new NamespacedChromeStorage(storage.sync, 'sync'),
  };
}

export async function restrictChromeStorageToTrustedContexts(storage: ChromeStorageLike): Promise<void> {
  await Promise.all([
    storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }),
    storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }),
    storage.sync.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
}
