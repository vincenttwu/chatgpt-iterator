import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { ChatGptConversationContext } from './types.ts';

export const CHATGPT_CONVERSATION_CONTEXT_SCHEMA_VERSION = 1 as const;

const ELIGIBLE_HOSTS = new Set(['chatgpt.com', 'chat.openai.com']);

function normalizePathname(pathname: string): string {
  if (pathname.length === 0) return '/';
  return pathname.slice(0, 2048);
}

export function conversationContextFromUrl(value: string): ChatGptConversationContext {
  try {
    const url = new URL(value);
    const pathname = normalizePathname(url.pathname);
    if (url.protocol !== 'https:' || !ELIGIBLE_HOSTS.has(url.hostname)) {
      return freezeJsonValue({ schemaVersion: CHATGPT_CONVERSATION_CONTEXT_SCHEMA_VERSION, kind: 'unsupported' as const, conversationId: null, pathname });
    }
    if (pathname === '/') {
      return freezeJsonValue({ schemaVersion: CHATGPT_CONVERSATION_CONTEXT_SCHEMA_VERSION, kind: 'new_chat' as const, conversationId: null, pathname });
    }
    const match = /^\/c\/([^/]+)\/?$/.exec(pathname);
    if (match !== null) {
      let conversationId: string;
      try { conversationId = decodeURIComponent(match[1]!); }
      catch { conversationId = match[1]!; }
      if (conversationId.length >= 1 && conversationId.length <= 256) {
        return freezeJsonValue({ schemaVersion: CHATGPT_CONVERSATION_CONTEXT_SCHEMA_VERSION, kind: 'conversation' as const, conversationId, pathname });
      }
    }
    return freezeJsonValue({ schemaVersion: CHATGPT_CONVERSATION_CONTEXT_SCHEMA_VERSION, kind: 'unsupported' as const, conversationId: null, pathname });
  } catch {
    return freezeJsonValue({ schemaVersion: CHATGPT_CONVERSATION_CONTEXT_SCHEMA_VERSION, kind: 'unsupported' as const, conversationId: null, pathname: '' });
  }
}

export function requireConversationContext(value: unknown): ChatGptConversationContext {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'conversation context must be an object');
  const candidate = value as Record<string, unknown>;
  const allowed = new Set(['schemaVersion', 'kind', 'conversationId', 'pathname']);
  for (const key of Object.keys(candidate)) if (!allowed.has(key)) throw new ContractError(ERROR_CODES.invalidMessage, `unexpected conversation context field: ${key}`);
  if (candidate.schemaVersion !== CHATGPT_CONVERSATION_CONTEXT_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported conversation context schema');
  if (candidate.kind !== 'new_chat' && candidate.kind !== 'conversation' && candidate.kind !== 'unsupported') throw new ContractError(ERROR_CODES.invalidMessage, 'conversation context kind is invalid');
  if (typeof candidate.pathname !== 'string' || candidate.pathname.length > 2048) throw new ContractError(ERROR_CODES.invalidMessage, 'conversation pathname must be a bounded string');
  if (candidate.kind === 'conversation') {
    if (typeof candidate.conversationId !== 'string' || candidate.conversationId.length < 1 || candidate.conversationId.length > 256) throw new ContractError(ERROR_CODES.invalidMessage, 'conversation context requires a bounded conversationId');
  } else if (candidate.conversationId !== null) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'non-conversation context conversationId must be null');
  }
  return freezeJsonValue(candidate as unknown as ChatGptConversationContext);
}

export function sameConversationContext(left: ChatGptConversationContext, right: ChatGptConversationContext): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'conversation') return left.conversationId === right.conversationId;
  return left.kind === 'new_chat';
}
