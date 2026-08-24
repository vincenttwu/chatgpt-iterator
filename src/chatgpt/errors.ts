import type { ChatGptDegradationCode } from './types.ts';

export const CHATGPT_ADAPTER_ERROR_CODES = Object.freeze({
  composerMissing: 'composer_missing',
  composerAmbiguous: 'composer_ambiguous',
  unsupportedRoute: 'unsupported_route',
  draftNotEmpty: 'draft_not_empty',
  sendUnavailable: 'send_unavailable',
  capabilityUnavailable: 'capability_unavailable',
  rateLimited: 'rate_limited',
  invalidCommand: 'invalid_command',
  responseBaselineChanged: 'response_baseline_changed',
  conversationChanged: 'conversation_changed',
} as const);

export type ChatGptAdapterErrorCode = (typeof CHATGPT_ADAPTER_ERROR_CODES)[keyof typeof CHATGPT_ADAPTER_ERROR_CODES];

export function degradationCodeForAdapterError(code: ChatGptAdapterErrorCode): ChatGptDegradationCode | null {
  if (code === CHATGPT_ADAPTER_ERROR_CODES.composerMissing) return 'composer_missing';
  if (code === CHATGPT_ADAPTER_ERROR_CODES.composerAmbiguous) return 'composer_ambiguous';
  if (code === CHATGPT_ADAPTER_ERROR_CODES.unsupportedRoute) return 'unsupported_route';
  if (code === CHATGPT_ADAPTER_ERROR_CODES.sendUnavailable || code === CHATGPT_ADAPTER_ERROR_CODES.capabilityUnavailable) return 'capability_unavailable';
  if (code === CHATGPT_ADAPTER_ERROR_CODES.conversationChanged) return 'conversation_mismatch';
  if (code === CHATGPT_ADAPTER_ERROR_CODES.rateLimited) return 'likely_rate_limited';
  return null;
}

export class ChatGptAdapterError extends Error {
  readonly code: ChatGptAdapterErrorCode;

  constructor(code: ChatGptAdapterErrorCode, message: string) {
    super(message);
    this.name = 'ChatGptAdapterError';
    this.code = code;
  }
}
