import type { JsonObject } from '../core/types.ts';

export const TAB_REGISTRY_SCHEMA_VERSION = 1 as const;
export const CHATGPT_TAB_URL_PATTERNS = Object.freeze([
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
] as const);

export const TAB_RUNTIME_OPERATIONS = Object.freeze({
  refresh: 'tabs.refresh',
  bind: 'tabs.bind',
  unbind: 'tabs.unbind',
  adapterState: 'tabs.adapterstate',
} as const);

export type ChatGptTabLifecycleState = 'ready' | 'degraded' | 'loading' | 'frozen' | 'discarded' | 'unavailable';
export type ChatGptTabTerminationReason = 'closed' | 'navigated_away' | 'replaced_unavailable';

export interface ChatGptTabTarget extends JsonObject {
  readonly schemaVersion: number;
  readonly tabId: number;
  readonly windowId: number;
  readonly active: boolean;
  readonly title: string | null;
  readonly url: string | null;
  readonly browserStatus: 'unloaded' | 'loading' | 'complete' | null;
  readonly lifecycleState: ChatGptTabLifecycleState;
  readonly autoDiscardable: boolean;
  readonly contentConnected: boolean;
  readonly adapterReady: boolean;
  readonly adapterBusy: boolean;
  readonly pageAlert: string | null;
}

export interface ChatGptTabBinding extends JsonObject {
  readonly schemaVersion: number;
  readonly tabId: number;
  readonly windowId: number;
  readonly boundAt: string;
  readonly reason: 'explicit' | 'replacement';
}

export interface ChatGptTabTermination extends JsonObject {
  readonly schemaVersion: number;
  readonly tabId: number;
  readonly windowId: number;
  readonly lifecycleState: 'closed';
  readonly reason: ChatGptTabTerminationReason;
  readonly occurredAt: string;
}

export interface ChatGptTabRegistrySnapshot extends JsonObject {
  readonly schemaVersion: number;
  readonly revision: number;
  readonly targets: ChatGptTabTarget[];
  readonly binding: ChatGptTabBinding | null;
  readonly lastTermination: ChatGptTabTermination | null;
}
