import type { JsonObject } from '../core/types.ts';

export interface MessageContext extends JsonObject {
  readonly iteration: number;
  readonly total: number;
  readonly remaining: number;
  readonly timestamp: string;
}

export interface MessageItem extends JsonObject {
  readonly content: string;
  readonly context: MessageContext;
  readonly delayAfterSeconds: number | null;
}

export interface MessageSource {
  next(context: MessageContext): MessageItem | null;
}
