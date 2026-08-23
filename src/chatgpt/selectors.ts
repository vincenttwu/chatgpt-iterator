export type SelectorRequirement = 'required' | 'conditional';

export interface SelectorDefinition {
  readonly key: 'composer' | 'send' | 'stop' | 'continue' | 'assistantMessages' | 'pageAlert';
  readonly requirement: SelectorRequirement;
  readonly candidates: readonly string[];
  readonly fallback?: string;
}

export const CHATGPT_SELECTOR_REGISTRY = Object.freeze({
  composer: Object.freeze({
    key: 'composer',
    requirement: 'required',
    candidates: Object.freeze(['#prompt-textarea']),
  }),
  send: Object.freeze({
    key: 'send',
    requirement: 'conditional',
    candidates: Object.freeze(['button[data-testid="send-button"]']),
    fallback: 'button[aria-label]',
  }),
  stop: Object.freeze({
    key: 'stop',
    requirement: 'conditional',
    candidates: Object.freeze(['button[data-testid="stop-button"]']),
    fallback: 'button[aria-label]',
  }),
  continue: Object.freeze({
    key: 'continue',
    requirement: 'conditional',
    candidates: Object.freeze([]),
    fallback: 'button',
  }),
  assistantMessages: Object.freeze({
    key: 'assistantMessages',
    requirement: 'required',
    candidates: Object.freeze(['[data-message-author-role="assistant"]']),
  }),
  pageAlert: Object.freeze({
    key: 'pageAlert',
    requirement: 'conditional',
    candidates: Object.freeze(['[role="alert"]']),
  }),
} satisfies Record<string, SelectorDefinition>);

export const SEND_ARIA_PATTERN = /^(?:send|傳送|发送|送信)/i;
export const STOP_ARIA_PATTERN = /(?:stop generating|stop response|停止生成|停止回應|停止回应)/i;
export const CONTINUE_TEXT_PATTERN = /(?:continue generating|continue response|繼續生成|继续生成|繼續回應|继续回应)/i;
