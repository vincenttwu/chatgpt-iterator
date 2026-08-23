import { freezeJsonValue } from '../core/index.ts';
import type { JsonObject, JsonValue } from '../core/types.ts';

export const BROWSER_SESSION_STORAGE_KEY = 'lifecycle.session.v1' as const;
export const BROWSER_SESSION_SCHEMA_VERSION = 1 as const;

export type BrowserSessionRecoveryKind = 'worker_restart' | 'browser_session_reset';

export interface BrowserSessionStorageLike {
  get(key: string): Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
}

export interface BrowserSessionMarker extends JsonObject {
  readonly schemaVersion: number;
  readonly sessionId: string;
  readonly startedAt: string;
}

export interface BrowserSessionStart extends JsonObject {
  readonly schemaVersion: number;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly recoveryKind: BrowserSessionRecoveryKind;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireMarker(value: unknown): BrowserSessionMarker | undefined {
  if (value === undefined) return undefined;
  if (value === null || Array.isArray(value) || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== BROWSER_SESSION_SCHEMA_VERSION) return undefined;
  if (typeof raw.sessionId !== 'string' || !UUID_V4.test(raw.sessionId)) return undefined;
  if (typeof raw.startedAt !== 'string' || Number.isNaN(Date.parse(raw.startedAt))) return undefined;
  return freezeJsonValue({ schemaVersion: BROWSER_SESSION_SCHEMA_VERSION, sessionId: raw.sessionId, startedAt: raw.startedAt });
}

export class BrowserSessionTracker {
  readonly #storage: BrowserSessionStorageLike;
  readonly #now: () => string;
  readonly #id: () => string;

  constructor(storage: BrowserSessionStorageLike, options: { now?: () => string; id?: () => string } = {}) {
    this.#storage = storage;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#id = options.id ?? (() => crypto.randomUUID());
  }

  async begin(): Promise<BrowserSessionStart> {
    const existing = requireMarker(await this.#storage.get(BROWSER_SESSION_STORAGE_KEY));
    if (existing !== undefined) {
      return freezeJsonValue({ ...existing, recoveryKind: 'worker_restart' as const });
    }
    const marker = requireMarker({ schemaVersion: BROWSER_SESSION_SCHEMA_VERSION, sessionId: this.#id(), startedAt: this.#now() });
    if (marker === undefined) throw new TypeError('generated browser session marker is invalid');
    await this.#storage.set(BROWSER_SESSION_STORAGE_KEY, marker);
    return freezeJsonValue({ ...marker, recoveryKind: 'browser_session_reset' as const });
  }
}
