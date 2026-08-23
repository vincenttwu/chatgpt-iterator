import type { AutoDiscardGuardManager, BrowserTabActivatedInfoLike, BrowserTabChangeInfoLike, BrowserTabLike, BrowserTabRemoveInfoLike, ChatGptTabRegistry, ChatGptTabRegistrySnapshot, TabBrowserLike } from '../tabs/index.ts';

export class TabLifecycleCoordinator {
  readonly #browser: TabBrowserLike;
  readonly #registry: ChatGptTabRegistry;
  readonly #guards: AutoDiscardGuardManager;
  readonly #onError: (error: unknown) => void;
  #started = false;
  #ready: Promise<ChatGptTabRegistrySnapshot> | undefined;

  constructor(browser: TabBrowserLike, registry: ChatGptTabRegistry, guards: AutoDiscardGuardManager, onError: (error: unknown) => void = () => undefined) {
    this.#browser = browser;
    this.#registry = registry;
    this.#guards = guards;
    this.#onError = onError;
  }

  readonly #activated = (info: BrowserTabActivatedInfoLike) => { void this.#registry.handleActivated(info.tabId, info.windowId).catch(this.#onError); };
  readonly #updated = (tabId: number, changeInfo: BrowserTabChangeInfoLike, tab: BrowserTabLike) => { void this.#registry.handleUpdated(tabId, changeInfo, tab).catch(this.#onError); };
  readonly #removed = (tabId: number, info: BrowserTabRemoveInfoLike) => {
    void (async () => {
      await this.#guards.handleRemoved(tabId);
      this.#registry.handleRemoved(tabId, info.windowId);
    })().catch(this.#onError);
  };
  readonly #replaced = (addedTabId: number, removedTabId: number) => {
    void (async () => {
      await this.#guards.handleReplaced(addedTabId, removedTabId);
      await this.#registry.handleReplaced(addedTabId, removedTabId);
    })().catch(this.#onError);
  };

  start(): Promise<ChatGptTabRegistrySnapshot> {
    if (this.#started) return this.#ready ?? Promise.resolve(this.#registry.snapshot());
    this.#started = true;
    this.#browser.onActivated.addListener(this.#activated);
    this.#browser.onUpdated.addListener(this.#updated);
    this.#browser.onRemoved.addListener(this.#removed);
    this.#browser.onReplaced.addListener(this.#replaced);
    this.#ready = this.#registry.refresh().catch((error: unknown) => {
      this.#onError(error);
      return this.#registry.snapshot();
    });
    return this.#ready;
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    this.#browser.onActivated.removeListener?.(this.#activated);
    this.#browser.onUpdated.removeListener?.(this.#updated);
    this.#browser.onRemoved.removeListener?.(this.#removed);
    this.#browser.onReplaced.removeListener?.(this.#replaced);
  }
}
