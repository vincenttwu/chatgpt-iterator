export const CHATGPT_ADAPTER_ERROR_CODES = Object.freeze({
  composerMissing: 'composer_missing',
  draftNotEmpty: 'draft_not_empty',
  sendUnavailable: 'send_unavailable',
  invalidCommand: 'invalid_command',
  responseBaselineChanged: 'response_baseline_changed',
} as const);

export type ChatGptAdapterErrorCode = (typeof CHATGPT_ADAPTER_ERROR_CODES)[keyof typeof CHATGPT_ADAPTER_ERROR_CODES];

export class ChatGptAdapterError extends Error {
  readonly code: ChatGptAdapterErrorCode;

  constructor(code: ChatGptAdapterErrorCode, message: string) {
    super(message);
    this.name = 'ChatGptAdapterError';
    this.code = code;
  }
}
