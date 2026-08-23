import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { JsonValue } from '../core/types.ts';
import type { TabBrowserLike } from './browser.ts';

export const DISCARD_GUARD_SESSION_KEY = 'discard-guards.v1' as const;
const DISCARD_GUARD_SCHEMA_VERSION = 1 as const;

export interface DiscardGuardStateStore {
  get(key: string): Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
  remove(key: string): Promise<void>;
}

interface GuardSlot {
  readonly tabId: number;
  originalAutoDiscardable: boolean;
  owners: Set<string>;
}

function requireOwnerId(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'discard-guard ownerId must be 1..128 characters');
  }
  return normalized;
}

function requireStoredState(value: unknown): Array<{ tabId: number; originalAutoDiscardable: boolean; owners: string[] }> {
  if (value === undefined) return [];
  if (value === null || Array.isArray(value) || typeof value !== 'object') return [];
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== DISCARD_GUARD_SCHEMA_VERSION || !Array.isArray(raw.slots)) return [];
  const result: Array<{ tabId: number; originalAutoDiscardable: boolean; owners: string[] }> = [];
  for (const value of raw.slots) {
    if (value === null || Array.isArray(value) || typeof value !== 'object') continue;
    const slot = value as Record<string, unknown>;
    if (!Number.isSafeInteger(slot.tabId) || (slot.tabId as number) < 0 || typeof slot.originalAutoDiscardable !== 'boolean' || !Array.isArray(slot.owners)) continue;
    const owners: string[] = [];
    for (const owner of slot.owners) {
      if (typeof owner !== 'string') continue;
      try { owners.push(requireOwnerId(owner)); } catch { /* ignore malformed retained owner */ }
    }
    if (owners.length > 0) result.push({ tabId: slot.tabId as number, originalAutoDiscardable: slot.originalAutoDiscardable, owners: [...new Set(owners)] });
  }
  return result;
}

export class AutoDiscardGuardManager {
  readonly #browser: TabBrowserLike;
  readonly #store: DiscardGuardStateStore | undefined;
  #slots = new Map<number, GuardSlot>();
  #ownerToTab = new Map<string, number>();
  readonly #ready: Promise<void>;

  constructor(browser: TabBrowserLike, store?: DiscardGuardStateStore) {
    this.#browser = browser;
    this.#store = store;
    this.#ready = store === undefined ? Promise.resolve() : this.#restore();
  }

  async ready(): Promise<void> { await this.#ready; }

  async acquire(ownerIdValue: string, tabId: number): Promise<void> {
    await this.#ready;
    const ownerId = requireOwnerId(ownerIdValue);
    const currentTab = this.#ownerToTab.get(ownerId);
    if (currentTab !== undefined && currentTab !== tabId) {
      throw new ContractError(ERROR_CODES.staleRequest, 'discard-guard owner is already bound to another tab');
    }
    let slot = this.#slots.get(tabId);
    if (slot === undefined) {
      const tab = await this.#browser.get(tabId);
      slot = { tabId, originalAutoDiscardable: tab.autoDiscardable, owners: new Set<string>() };
      this.#slots.set(tabId, slot);
      if (tab.autoDiscardable) await this.#browser.update(tabId, { autoDiscardable: false });
    }
    slot.owners.add(ownerId);
    this.#ownerToTab.set(ownerId, tabId);
    await this.#persist();
  }

  async release(ownerIdValue: string): Promise<void> {
    await this.#ready;
    const ownerId = requireOwnerId(ownerIdValue);
    const tabId = this.#ownerToTab.get(ownerId);
    if (tabId === undefined) return;
    this.#ownerToTab.delete(ownerId);
    const slot = this.#slots.get(tabId);
    if (slot === undefined) { await this.#persist(); return; }
    slot.owners.delete(ownerId);
    if (slot.owners.size !== 0) { await this.#persist(); return; }
    this.#slots.delete(tabId);
    if (slot.originalAutoDiscardable) {
      try {
        const tab = await this.#browser.get(tabId);
        if (!tab.autoDiscardable) await this.#browser.update(tabId, { autoDiscardable: true });
      } catch {
        // Closed/replaced tabs have no state left to restore.
      }
    }
    await this.#persist();
  }

  async handleRemoved(tabId: number): Promise<void> {
    await this.#ready;
    const slot = this.#slots.get(tabId);
    if (slot === undefined) return;
    for (const owner of slot.owners) this.#ownerToTab.delete(owner);
    this.#slots.delete(tabId);
    await this.#persist();
  }

  async handleReplaced(addedTabId: number, removedTabId: number): Promise<void> {
    await this.#ready;
    const slot = this.#slots.get(removedTabId);
    if (slot === undefined) return;
    let tab;
    try {
      tab = await this.#browser.get(addedTabId);
    } catch {
      for (const owner of slot.owners) this.#ownerToTab.delete(owner);
      this.#slots.delete(removedTabId);
      await this.#persist();
      return;
    }
    this.#slots.delete(removedTabId);
    const replacement: GuardSlot = {
      tabId: addedTabId,
      originalAutoDiscardable: tab.autoDiscardable,
      owners: new Set(slot.owners),
    };
    this.#slots.set(addedTabId, replacement);
    for (const owner of replacement.owners) this.#ownerToTab.set(owner, addedTabId);
    if (tab.autoDiscardable) await this.#browser.update(addedTabId, { autoDiscardable: false });
    await this.#persist();
  }

  ownerTab(ownerId: string): number | undefined { return this.#ownerToTab.get(ownerId); }

  async #restore(): Promise<void> {
    const retained = requireStoredState(await this.#store?.get(DISCARD_GUARD_SESSION_KEY));
    for (const saved of retained) {
      try {
        const tab = await this.#browser.get(saved.tabId);
        const slot: GuardSlot = { tabId: saved.tabId, originalAutoDiscardable: saved.originalAutoDiscardable, owners: new Set(saved.owners) };
        this.#slots.set(saved.tabId, slot);
        for (const owner of slot.owners) this.#ownerToTab.set(owner, saved.tabId);
        if (tab.autoDiscardable) await this.#browser.update(saved.tabId, { autoDiscardable: false });
      } catch {
        // Tab IDs are browser-session scoped. Stale slots are discarded safely.
      }
    }
    await this.#persist();
  }

  async #persist(): Promise<void> {
    if (this.#store === undefined) return;
    const slots = [...this.#slots.values()].map((slot) => freezeJsonValue({
      tabId: slot.tabId,
      originalAutoDiscardable: slot.originalAutoDiscardable,
      owners: [...slot.owners].sort(),
    }));
    if (slots.length === 0) { await this.#store.remove(DISCARD_GUARD_SESSION_KEY); return; }
    await this.#store.set(DISCARD_GUARD_SESSION_KEY, freezeJsonValue({ schemaVersion: DISCARD_GUARD_SCHEMA_VERSION, slots }));
  }
}
