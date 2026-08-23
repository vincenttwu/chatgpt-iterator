import { freezeJsonValue } from '../core/json.ts';
import { messageItem } from './template.ts';
import type { MessageContext, MessageItem, MessageSource } from './types.ts';

export class RepeatMessageSource implements MessageSource {
  readonly #template: string;
  constructor(template: string) { this.#template = template; }
  next(context: MessageContext): MessageItem | null {
    if (context.iteration > context.total) return null;
    return { ...messageItem(this.#template, freezeJsonValue(context)), delayAfterSeconds: null };
  }
}
