import { ContractError, ERROR_CODES } from '../core/index.ts';
import { freezeJsonValue } from '../core/json.ts';
import type { MessageContext, MessageItem } from './types.ts';

export const MESSAGE_TEMPLATE_TOKENS = Object.freeze(['iteration', 'total', 'remaining', 'timestamp'] as const);
const TOKEN_PATTERN = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
const MAX_TEMPLATE_LENGTH = 65_536;

export function validateMessageTemplate(template: string): readonly string[] {
  if (typeof template !== 'string' || template.trim().length === 0 || template.length > MAX_TEMPLATE_LENGTH) {
    throw new ContractError(ERROR_CODES.invalidMessage, `message template must be 1..${MAX_TEMPLATE_LENGTH} characters`);
  }
  const tokens = new Set<string>();
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const rawToken = match[1]!;
    if (!MESSAGE_TEMPLATE_TOKENS.includes(rawToken as (typeof MESSAGE_TEMPLATE_TOKENS)[number])) {
      throw new ContractError(ERROR_CODES.invalidMessage, `unsupported message template token: ${rawToken}`);
    }
    tokens.add(rawToken);
  }
  return Object.freeze([...tokens]);
}

export function renderMessageTemplate(template: string, context: MessageContext): string {
  validateMessageTemplate(template);
  return template.replace(TOKEN_PATTERN, (whole, rawToken: string) => {
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
