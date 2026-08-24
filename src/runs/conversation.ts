import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { ChatGptConversationContext } from '../chatgpt/types.ts';
import type { RunConversationBinding } from './types.ts';

export type RunConversationDisposition = 'match'|'adopt'|'mismatch';

export function requireRunConversationBinding(value: unknown): RunConversationBinding {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'run conversation binding must be an object');
  const candidate = value as Record<string, unknown>;
  const allowed = new Set(['kind','conversationId']);
  for (const key of Object.keys(candidate)) if (!allowed.has(key)) throw new ContractError(ERROR_CODES.invalidMessage, `unexpected run conversation binding field: ${key}`);
  if (candidate.kind !== 'unbound' && candidate.kind !== 'pending_new_chat' && candidate.kind !== 'conversation') throw new ContractError(ERROR_CODES.invalidMessage, 'invalid run conversation binding kind');
  if (candidate.kind === 'conversation') {
    if (typeof candidate.conversationId !== 'string' || candidate.conversationId.length < 1 || candidate.conversationId.length > 256) throw new ContractError(ERROR_CODES.invalidMessage, 'bound run conversation requires a bounded conversationId');
  } else if (candidate.conversationId !== null) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'unbound/pending run conversationId must be null');
  }
  return freezeJsonValue(candidate as unknown as RunConversationBinding);
}

export function conversationBindingFromContext(context: ChatGptConversationContext | undefined): RunConversationBinding {
  if (context === undefined || context.kind === 'unsupported') return freezeJsonValue({ kind: 'unbound' as const, conversationId: null });
  if (context.kind === 'new_chat') return freezeJsonValue({ kind: 'pending_new_chat' as const, conversationId: null });
  return freezeJsonValue({ kind: 'conversation' as const, conversationId: context.conversationId });
}

export function conversationDisposition(binding: RunConversationBinding, context: ChatGptConversationContext): RunConversationDisposition {
  if (binding.kind === 'unbound' || context.kind === 'unsupported') return 'mismatch';
  if (binding.kind === 'pending_new_chat') return context.kind === 'new_chat' ? 'match' : context.kind === 'conversation' ? 'adopt' : 'mismatch';
  return context.kind === 'conversation' && context.conversationId === binding.conversationId ? 'match' : 'mismatch';
}

export function isConversationCompatible(binding: RunConversationBinding, context: ChatGptConversationContext): boolean {
  return conversationDisposition(binding, context) !== 'mismatch';
}
