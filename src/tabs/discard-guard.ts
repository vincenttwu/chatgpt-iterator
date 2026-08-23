import { ContractError, ERROR_CODES } from '../core/index.ts';
import type { TabBrowserLike } from './browser.ts';

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

export class AutoDiscardGuardManager {
  readonly #browser: TabBrowserLike;
  #slots = new Map<number, GuardSlot>();
  #ownerToTab = new Map<string, number>();

  constructor(browser: TabBrowserLike) { this.#browser = browser; }

  async acquire(ownerIdValue: string, tabId: number): Promise<void> {
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
  }

  async release(ownerIdValue: string): Promise<void> {
    const ownerId = requireOwnerId(ownerIdValue);
    const tabId = this.#ownerToTab.get(ownerId);
    if (tabId === undefined) return;
    this.#ownerToTab.delete(ownerId);
    const slot = this.#slots.get(tabId);
    if (slot === undefined) return;
    slot.owners.delete(ownerId);
    if (slot.owners.size !== 0) return;
    this.#slots.delete(tabId);
    if (!slot.originalAutoDiscardable) return;
    try {
      const tab = await this.#browser.get(tabId);
      if (!tab.autoDiscardable) await this.#browser.update(tabId, { autoDiscardable: true });
    } catch {
      // Closed/replaced tabs have no state left to restore.
    }
  }

  handleRemoved(tabId: number): void {
    const slot = this.#slots.get(tabId);
    if (slot === undefined) return;
    for (const owner of slot.owners) this.#ownerToTab.delete(owner);
    this.#slots.delete(tabId);
  }

  async handleReplaced(addedTabId: number, removedTabId: number): Promise<void> {
    const slot = this.#slots.get(removedTabId);
    if (slot === undefined) return;
    let tab;
    try {
      tab = await this.#browser.get(addedTabId);
    } catch {
      for (const owner of slot.owners) this.#ownerToTab.delete(owner);
      this.#slots.delete(removedTabId);
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
  }

  ownerTab(ownerId: string): number | undefined { return this.#ownerToTab.get(ownerId); }
}
