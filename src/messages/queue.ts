import { freezeJsonValue } from '../core/json.ts';
import { messageItem } from './template.ts';
import type { QueueRunItem } from '../runs/types.ts';
import type { MessageContext, MessageItem, MessageSource } from './types.ts';

export class QueueMessageSource implements MessageSource {
  readonly #items: readonly QueueRunItem[];
  constructor(items: readonly QueueRunItem[]) { this.#items = items; }
  next(context: MessageContext): MessageItem | null {
    const source = this.#items[context.iteration - 1];
    if (source === undefined) return null;
    const rendered = messageItem(source.content, freezeJsonValue(context));
    return { ...rendered, delayAfterSeconds: source.delayAfterSeconds };
  }
}
