import type { JsonObject } from '../core/types.ts';

export const CHATGPT_ADAPTER_SCHEMA_VERSION = 3 as const;
export const CHATGPT_ADAPTER_OPERATIONS = Object.freeze({
  snapshot: 'chatgpt.snapshot',
  diagnostics: 'chatgpt.diagnostics',
  send: 'chatgpt.send',
  continueResponse: 'chatgpt.continue',
  stopResponse: 'chatgpt.stop',
  scrollToBottom: 'chatgpt.scroll',
} as const);

export type ChatGptAdapterOperation = (typeof CHATGPT_ADAPTER_OPERATIONS)[keyof typeof CHATGPT_ADAPTER_OPERATIONS];
export type ChatGptAdapterStatus = 'ready' | 'unavailable' | 'degraded';
export type ChatGptConversationKind = 'new_chat' | 'conversation' | 'unsupported';

export interface ChatGptConversationContext extends JsonObject {
  readonly schemaVersion: number;
  readonly kind: ChatGptConversationKind;
  readonly conversationId: string | null;
  readonly pathname: string;
}
export type SelectorHealthStatus = 'ready' | 'empty' | 'absent' | 'disabled';

export interface SelectorHealth extends JsonObject {
  readonly key: string;
  readonly requirement: 'required' | 'conditional';
  readonly status: SelectorHealthStatus;
  readonly matchedBy: string | null;
  readonly count: number;
}

export interface ChatGptAdapterDiagnostics extends JsonObject {
  readonly schemaVersion: number;
  readonly status: ChatGptAdapterStatus;
  readonly capabilities: SelectorHealth[];
  readonly pageAlert: string | null;
}

export interface ChatGptAdapterSnapshot extends JsonObject {
  readonly schemaVersion: number;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly composerPresent: boolean;
  readonly composerHasDraft: boolean;
  readonly sendAvailable: boolean;
  readonly continueAvailable: boolean;
  readonly stopAvailable: boolean;
  readonly assistantFingerprint: string;
  readonly assistantMessageCount: number;
  readonly pageAlert: string | null;
  readonly conversation: ChatGptConversationContext;
}

export interface ChatGptObservation extends JsonObject {
  readonly schemaVersion: number;
  readonly revision: number;
  readonly reason: 'initial' | 'dom_mutation';
  readonly observedAt: string;
  readonly snapshot: ChatGptAdapterSnapshot;
}

export interface ChatGptSendResult extends JsonObject {
  readonly schemaVersion: number;
  readonly status: 'sent';
  readonly assistantBaselineFingerprint: string;
}

export interface ChatGptClickResult extends JsonObject {
  readonly schemaVersion: number;
  readonly clicked: boolean;
}

export type ResponseProgressState = 'waiting_start' | 'active' | 'continue_available' | 'stable' | 'timed_out';

export interface ResponseProgress extends JsonObject {
  readonly schemaVersion: number;
  readonly state: ResponseProgressState;
  readonly observedActivity: boolean;
  readonly assistantFingerprint: string;
  readonly nextDeadlineAt: number | null;
}
