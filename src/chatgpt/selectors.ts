export type SelectorRequirement = 'required' | 'conditional';
export type SelectorRole = 'structural' | 'capability' | 'diagnostic';

export interface SelectorDefinition {
  readonly key: 'composer' | 'assistantMessages' | 'send' | 'stop' | 'continue' | 'voice' | 'pageAlert' | 'composerDriftHint';
  readonly role: SelectorRole;
  readonly requirement: SelectorRequirement;
  readonly candidates: readonly string[];
  readonly fallback?: string;
}

export const CHATGPT_SELECTOR_REGISTRY = Object.freeze({
  composer: Object.freeze({
    key: 'composer',
    role: 'structural',
    requirement: 'required',
    candidates: Object.freeze(['#prompt-textarea[contenteditable="true"]']),
  }),
  assistantMessages: Object.freeze({
    key: 'assistantMessages',
    role: 'structural',
    requirement: 'required',
    candidates: Object.freeze(['[data-message-author-role="assistant"]']),
  }),
  send: Object.freeze({
    key: 'send',
    role: 'capability',
    requirement: 'conditional',
    candidates: Object.freeze(['button[data-testid="send-button"]']),
    fallback: 'button[aria-label]',
  }),
  stop: Object.freeze({
    key: 'stop',
    role: 'capability',
    requirement: 'conditional',
    candidates: Object.freeze(['button[data-testid="stop-button"]']),
    fallback: 'button[aria-label]',
  }),
  continue: Object.freeze({
    key: 'continue',
    role: 'capability',
    requirement: 'conditional',
    candidates: Object.freeze([]),
    fallback: 'button',
  }),
  voice: Object.freeze({
    key: 'voice',
    role: 'capability',
    requirement: 'conditional',
    candidates: Object.freeze(['button[aria-label="Start Voice"]']),
    fallback: 'button[aria-label]',
  }),
  pageAlert: Object.freeze({
    key: 'pageAlert',
    role: 'diagnostic',
    requirement: 'conditional',
    candidates: Object.freeze(['[role="alert"]']),
  }),
  composerDriftHint: Object.freeze({
    key: 'composerDriftHint',
    role: 'diagnostic',
    requirement: 'conditional',
    candidates: Object.freeze(['#prompt-textarea', 'textarea[name="prompt-textarea"]']),
  }),
} satisfies Record<string, SelectorDefinition>);

export const SEND_ARIA_PATTERN = /^(?:send|傳送|发送|送信)/i;
export const STOP_ARIA_PATTERN = /(?:stop generating|stop response|停止生成|停止回應|停止回应)/i;
export const CONTINUE_TEXT_PATTERN = /(?:continue generating|continue response|繼續生成|继续生成|繼續回應|继续回应)/i;
export const VOICE_ARIA_PATTERN = /^(?:start voice|voice|開始語音|开始语音)/i;
export const RATE_LIMIT_ALERT_PATTERN = /(?:rate limit|too many requests|try again later|temporarily unavailable|usage limit|限流|請稍後再試|请稍后再试|使用上限)/i;
