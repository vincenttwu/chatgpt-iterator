import { ContractError, ERROR_CODES } from '../core/index.ts';
import { freezeJsonValue } from '../core/json.ts';
import type { MessageContext, MessageItem } from './types.ts';

export const MESSAGE_TEMPLATE_TOKENS = Object.freeze(['iteration', 'total', 'remaining', 'timestamp'] as const);
const TOKEN_PATTERN = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

export function renderMessageTemplate(template: string, context: MessageContext): string {
  if (typeof template !== 'string' || template.trim().length === 0 || template.length > 65_536) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'message template must be 1..65536 characters');
  }
  return template.replace(TOKEN_PATTERN, (whole, rawToken: string) => {
    if (!MESSAGE_TEMPLATE_TOKENS.includes(rawToken as (typeof MESSAGE_TEMPLATE_TOKENS)[number])) {
      throw new ContractError(ERROR_CODES.invalidMessage, `unsupported message template token: ${rawToken}`);
    }
    switch (rawToken) {
      case 'iteration': return String(context.iteration);
      case 'total': return String(context.total);
      case 'remaining': return String(context.remaining);
      case 'timestamp': return context.timestamp;
      default: return whole;
    }
  });
}

export function messageItem(template: string, context: MessageContext): MessageItem {
  return freezeJsonValue({ content: renderMessageTemplate(template, context), context });
}
