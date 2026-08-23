export type BrowserTabStatus = 'unloaded' | 'loading' | 'complete';

export interface BrowserTabLike {
  readonly id?: number;
  readonly windowId: number;
  readonly active: boolean;
  readonly autoDiscardable: boolean;
  readonly discarded: boolean;
  readonly frozen?: boolean;
  readonly status?: BrowserTabStatus;
  readonly title?: string;
  readonly url?: string;
}

export interface BrowserTabChangeInfoLike {
  readonly autoDiscardable?: boolean;
  readonly discarded?: boolean;
  readonly frozen?: boolean;
  readonly status?: BrowserTabStatus;
  readonly title?: string;
  readonly url?: string;
}

export interface BrowserTabRemoveInfoLike {
  readonly windowId: number;
  readonly isWindowClosing: boolean;
}

export interface BrowserTabActivatedInfoLike {
  readonly tabId: number;
  readonly windowId: number;
}

export interface BrowserEventLike<T extends (...args: never[]) => unknown> {
  addListener(listener: T): void;
  removeListener?(listener: T): void;
}

export interface TabBrowserLike {
  query(queryInfo: { readonly url?: readonly string[] }): Promise<BrowserTabLike[]>;
  get(tabId: number): Promise<BrowserTabLike>;
  update(tabId: number, updateProperties: { readonly autoDiscardable?: boolean }): Promise<BrowserTabLike | undefined>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
  readonly onActivated: BrowserEventLike<(activeInfo: BrowserTabActivatedInfoLike) => void>;
  readonly onUpdated: BrowserEventLike<(tabId: number, changeInfo: BrowserTabChangeInfoLike, tab: BrowserTabLike) => void>;
  readonly onRemoved: BrowserEventLike<(tabId: number, removeInfo: BrowserTabRemoveInfoLike) => void>;
  readonly onReplaced: BrowserEventLike<(addedTabId: number, removedTabId: number) => void>;
}
