import { ContractError, ERROR_CODES, createRequest, freezeJsonValue, requireMessageEnvelope } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import { CHATGPT_ADAPTER_OPERATIONS, requireChatGptAdapterSnapshot, type ChatGptAdapterSnapshot } from '../chatgpt/index.ts';
import type { BrowserTabChangeInfoLike, BrowserTabLike, TabBrowserLike } from './browser.ts';
import {
  CHATGPT_TAB_URL_PATTERNS,
  TAB_REGISTRY_SCHEMA_VERSION,
  type ChatGptTabBinding,
  type ChatGptTabLifecycleState,
  type ChatGptTabRegistrySnapshot,
  type ChatGptTabTarget,
  type ChatGptTabTerminationReason,
} from './types.ts';

function bounded(value: string | undefined, limit: number): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, limit);
}

function isChatGptUrl(value: string | undefined): boolean {
  if (value === undefined) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com');
  } catch {
    return false;
  }
}

function requireAdapterSnapshot(value: unknown): ChatGptAdapterSnapshot { return requireChatGptAdapterSnapshot(value); }

function browserLifecycle(tab: BrowserTabLike): ChatGptTabLifecycleState | null {
  if (tab.discarded) return 'discarded';
  if (tab.frozen === true) return 'frozen';
  if (tab.status === 'loading' || tab.status === 'unloaded') return 'loading';
  return null;
}

function targetFrom(tab: BrowserTabLike, adapter: ChatGptAdapterSnapshot | null, connected: boolean): ChatGptTabTarget {
  if (tab.id === undefined) throw new ContractError(ERROR_CODES.unavailable, 'browser tab has no tabId');
  const lifecycle = browserLifecycle(tab) ?? (
    !connected || adapter === null ? 'unavailable' : adapter.pageAlert !== null ? 'degraded' : adapter.ready ? 'ready' : 'unavailable'
  );
  return freezeJsonValue({
    schemaVersion: TAB_REGISTRY_SCHEMA_VERSION,
    tabId: tab.id,
    windowId: tab.windowId,
    active: tab.active,
    title: bounded(tab.title, 256),
    url: bounded(tab.url, 2048),
    browserStatus: tab.status ?? null,
    lifecycleState: lifecycle,
    autoDiscardable: tab.autoDiscardable,
    contentConnected: connected,
    adapterReady: adapter?.ready ?? false,
    adapterBusy: adapter?.busy ?? false,
    pageAlert: adapter?.pageAlert === undefined ? null : bounded(adapter.pageAlert ?? undefined, 512),
  });
}

export class ChatGptTabRegistry {
  readonly #browser: TabBrowserLike;
  readonly #now: () => string;
  #revision = 0;
  #probeSequence = 0;
  #targets = new Map<number, ChatGptTabTarget>();
  #binding: ChatGptTabBinding | null = null;
  #lastTermination: ChatGptTabRegistrySnapshot['lastTermination'] = null;
  #listeners = new Set<(snapshot: ChatGptTabRegistrySnapshot) => void>();

  constructor(browser: TabBrowserLike, now: () => string = () => new Date().toISOString()) {
    this.#browser = browser;
    this.#now = now;
  }

  snapshot(): ChatGptTabRegistrySnapshot {
    return freezeJsonValue({
      schemaVersion: TAB_REGISTRY_SCHEMA_VERSION,
      revision: this.#revision,
      targets: [...this.#targets.values()].sort((left, right) => left.windowId - right.windowId || left.tabId - right.tabId),
      binding: this.#binding,
      lastTermination: this.#lastTermination,
    });
  }

  subscribe(listener: (snapshot: ChatGptTabRegistrySnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => this.#listeners.delete(listener);
  }

  async refresh(): Promise<ChatGptTabRegistrySnapshot> {
    const tabs = await this.#browser.query({ url: CHATGPT_TAB_URL_PATTERNS });
    const next = new Map<number, ChatGptTabTarget>();
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      next.set(tab.id, await this.#inspect(tab));
    }
    this.#targets = next;
    if (this.#binding !== null && !this.#targets.has(this.#binding.tabId)) {
      try {
        const boundTab = await this.#browser.get(this.#binding.tabId);
        if (boundTab.url !== undefined && !isChatGptUrl(boundTab.url)) {
          this.#terminate(this.#binding.tabId, this.#binding.windowId, 'navigated_away');
          return this.snapshot();
        }
        this.#targets.set(this.#binding.tabId, await this.#inspect(boundTab));
      } catch {
        this.#terminate(this.#binding.tabId, this.#binding.windowId, 'closed');
        return this.snapshot();
      }
    }
    this.#emit();
    return this.snapshot();
  }

  async bind(tabId: number): Promise<ChatGptTabRegistrySnapshot> {
    let target = this.#targets.get(tabId);
    if (target === undefined) {
      const tab = await this.#browser.get(tabId);
      if (!isChatGptUrl(tab.url)) throw new ContractError(ERROR_CODES.unavailable, 'target tab is not an eligible ChatGPT tab');
      target = await this.#inspect(tab);
      this.#targets.set(tabId, target);
    }
    this.#binding = freezeJsonValue({
      schemaVersion: TAB_REGISTRY_SCHEMA_VERSION,
      tabId: target.tabId,
      windowId: target.windowId,
      boundAt: this.#now(),
      reason: 'explicit' as const,
    });
    this.#lastTermination = null;
    this.#emit();
    return this.snapshot();
  }

  unbind(): ChatGptTabRegistrySnapshot {
    if (this.#binding === null) return this.snapshot();
    this.#binding = null;
    this.#emit();
    return this.snapshot();
  }

  async noteAdapterState(tabId: number, windowId: number, rawSnapshot: unknown): Promise<ChatGptTabRegistrySnapshot> {
    const adapter = requireAdapterSnapshot(rawSnapshot);
    let tab: BrowserTabLike;
    try {
      tab = await this.#browser.get(tabId);
    } catch {
      return this.snapshot();
    }
    if (tab.id === undefined || tab.windowId !== windowId || (tab.url !== undefined && !isChatGptUrl(tab.url))) return this.snapshot();
    const nextTarget = targetFrom(tab, adapter, true);
    const previous = this.#targets.get(tabId);
    if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(nextTarget)) return this.snapshot();
    this.#targets.set(tabId, nextTarget);
    this.#emit();
    return this.snapshot();
  }

  async handleUpdated(tabId: number, _changeInfo: BrowserTabChangeInfoLike, tab: BrowserTabLike): Promise<void> {
    const wasKnown = this.#targets.has(tabId) || this.#binding?.tabId === tabId;
    if (tab.url !== undefined && !isChatGptUrl(tab.url)) {
      this.#targets.delete(tabId);
      if (this.#binding?.tabId === tabId) this.#terminate(tabId, tab.windowId, 'navigated_away');
      else if (wasKnown) this.#emit();
      return;
    }
    if (!wasKnown && !isChatGptUrl(tab.url)) return;
    this.#targets.set(tabId, await this.#inspect(tab));
    this.#emit();
  }

  async handleActivated(tabId: number, windowId: number): Promise<void> {
    let changed = false;
    for (const [id, target] of this.#targets) {
      if (target.windowId !== windowId) continue;
      const active = id === tabId;
      if (target.active === active) continue;
      this.#targets.set(id, freezeJsonValue({ ...target, active }));
      changed = true;
    }
    if (changed) this.#emit();
  }

  handleRemoved(tabId: number, windowId: number): void {
    const wasKnown = this.#targets.delete(tabId);
    if (this.#binding?.tabId === tabId) {
      this.#terminate(tabId, windowId, 'closed');
      return;
    }
    if (wasKnown) this.#emit();
  }

  async handleReplaced(addedTabId: number, removedTabId: number): Promise<void> {
    const binding = this.#binding?.tabId === removedTabId ? this.#binding : null;
    this.#targets.delete(removedTabId);
    let added: BrowserTabLike;
    try {
      added = await this.#browser.get(addedTabId);
    } catch {
      if (binding !== null) this.#terminate(removedTabId, binding.windowId, 'replaced_unavailable');
      else this.#emit();
      return;
    }
    if (added.url !== undefined && !isChatGptUrl(added.url)) {
      if (binding !== null) this.#terminate(removedTabId, binding.windowId, 'replaced_unavailable');
      else this.#emit();
      return;
    }
    const target = await this.#inspect(added);
    this.#targets.set(addedTabId, target);
    if (binding !== null) {
      this.#binding = freezeJsonValue({
        schemaVersion: TAB_REGISTRY_SCHEMA_VERSION,
        tabId: target.tabId,
        windowId: target.windowId,
        boundAt: binding.boundAt,
        reason: 'replacement' as const,
      });
    }
    this.#emit();
  }

  async #inspect(tab: BrowserTabLike): Promise<ChatGptTabTarget> {
    const immediate = browserLifecycle(tab);
    if (immediate !== null) return targetFrom(tab, null, false);
    if (tab.id === undefined) throw new ContractError(ERROR_CODES.unavailable, 'browser tab has no tabId');
    try {
      this.#probeSequence += 1;
      const response = requireMessageEnvelope(await this.#browser.sendMessage(tab.id, createRequest({
        requestSequence: this.#probeSequence,
        intent: 'query',
        source: 'background',
        target: 'content',
        operation: CHATGPT_ADAPTER_OPERATIONS.snapshot,
        payload: {},
      })));
      if (response.kind !== 'response' || !response.outcome.ok) return targetFrom(tab, null, true);
      return targetFrom(tab, requireAdapterSnapshot(response.outcome.value), true);
    } catch {
      return targetFrom(tab, null, false);
    }
  }

  #terminate(tabId: number, windowId: number, reason: ChatGptTabTerminationReason): void {
    this.#binding = null;
    this.#lastTermination = freezeJsonValue({
      schemaVersion: TAB_REGISTRY_SCHEMA_VERSION,
      tabId,
      windowId,
      lifecycleState: 'closed' as const,
      reason,
      occurredAt: this.#now(),
    });
    this.#emit();
  }

  #emit(): void {
    this.#revision += 1;
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
