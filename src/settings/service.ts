import { ContractError, ERROR_CODES } from '../core/index.ts';
import type { NamespacedChromeStorage } from '../persistence/chrome-storage.ts';
import { createDefaultSettings, requireSettingsSnapshot, requireSettingsWriteInput } from './model.ts';
import { SETTINGS_SCHEMA_VERSION, SETTINGS_STORAGE_KEY, type SettingsSnapshot, type SettingsWriteInput } from './types.ts';

export class SettingsService {
  readonly #storage: NamespacedChromeStorage;
  readonly #now: () => string;
  constructor(storage: NamespacedChromeStorage, now: () => string = () => new Date().toISOString()) { this.#storage = storage; this.#now = now; }

  async get(): Promise<SettingsSnapshot> {
    const stored = await this.#storage.get(SETTINGS_STORAGE_KEY);
    if (stored !== undefined) return requireSettingsSnapshot(stored);
    const initial = createDefaultSettings(this.#now());
    await this.#storage.set(SETTINGS_STORAGE_KEY, initial);
    return initial;
  }

  async restore(snapshot: SettingsSnapshot): Promise<void> {
    await this.#storage.set(SETTINGS_STORAGE_KEY, requireSettingsSnapshot(snapshot));
  }

  async update(expectedRevision: unknown, input: SettingsWriteInput | Record<string, unknown>): Promise<SettingsSnapshot> {
    if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 1) throw new ContractError(ERROR_CODES.invalidMessage, 'expected settings revision must be a positive safe integer');
    const current = await this.get();
    if (current.revision !== expectedRevision) throw new ContractError(ERROR_CODES.staleRequest, `settings revision changed to ${current.revision}`);
    const write = requireSettingsWriteInput(input);
    const next: SettingsSnapshot = requireSettingsSnapshot({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      revision: current.revision + 1,
      ...write,
      appearance: 'system',
      updatedAt: this.#now(),
    });
    await this.#storage.set(SETTINGS_STORAGE_KEY, next);
    return next;
  }
}
