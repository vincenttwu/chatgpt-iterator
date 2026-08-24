import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { ChatGptAdapterSnapshot } from './types.ts';
import { CHATGPT_ADAPTER_SCHEMA_VERSION } from './types.ts';
import { assistantFingerprintFromLegacySignature, isAssistantFingerprint } from './fingerprint.ts';
import { requireConversationContext } from './conversation.ts';

const BOOLEAN_FIELDS = ['ready', 'busy', 'composerPresent', 'sendAvailable', 'continueAvailable', 'stopAvailable'] as const;
const UNKNOWN_CONVERSATION = Object.freeze({ schemaVersion: 1, kind: 'unsupported' as const, conversationId: null, pathname: '' });

function requireCommon(candidate: Record<string, unknown>): void {
  for (const key of BOOLEAN_FIELDS) if (typeof candidate[key] !== 'boolean') throw new ContractError(ERROR_CODES.invalidMessage, `adapter snapshot ${key} must be boolean`);
  if (!Number.isSafeInteger(candidate.assistantMessageCount) || (candidate.assistantMessageCount as number) < 0) throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot assistantMessageCount must be a non-negative safe integer');
  if (!(candidate.pageAlert === null || typeof candidate.pageAlert === 'string')) throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot pageAlert must be string|null');
}

function requireOnly(candidate: Record<string, unknown>, allowed: readonly string[]): void {
  const set = new Set(allowed);
  for (const key of Object.keys(candidate)) if (!set.has(key)) throw new ContractError(ERROR_CODES.invalidMessage, `unexpected adapter snapshot field: ${key}`);
}

export function requireChatGptAdapterSnapshot(value: unknown): ChatGptAdapterSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot must be an object');
  const candidate = value as Record<string, unknown>;
  requireCommon(candidate);
  if (candidate.schemaVersion === 1) {
    requireOnly(candidate, ['schemaVersion','ready','busy','composerPresent','composerDraft','sendAvailable','continueAvailable','stopAvailable','assistantSignature','assistantMessageCount','pageAlert']);
    if (typeof candidate.composerDraft !== 'string' || typeof candidate.assistantSignature !== 'string') throw new ContractError(ERROR_CODES.invalidMessage, 'legacy adapter snapshot text fields are invalid');
    return freezeJsonValue({
      schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
      ready: candidate.ready as boolean,
      busy: candidate.busy as boolean,
      composerPresent: candidate.composerPresent as boolean,
      composerHasDraft: candidate.composerDraft.trim().length !== 0,
      sendAvailable: candidate.sendAvailable as boolean,
      continueAvailable: candidate.continueAvailable as boolean,
      stopAvailable: candidate.stopAvailable as boolean,
      assistantFingerprint: assistantFingerprintFromLegacySignature(candidate.assistantSignature),
      assistantMessageCount: candidate.assistantMessageCount as number,
      pageAlert: candidate.pageAlert as string | null,
      conversation: UNKNOWN_CONVERSATION,
    });
  }
  if (candidate.schemaVersion === 2) {
    requireOnly(candidate, ['schemaVersion','ready','busy','composerPresent','composerHasDraft','sendAvailable','continueAvailable','stopAvailable','assistantFingerprint','assistantMessageCount','pageAlert']);
    if (typeof candidate.composerHasDraft !== 'boolean' || !isAssistantFingerprint(candidate.assistantFingerprint)) throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot privacy fields are invalid');
    return freezeJsonValue({ ...candidate, schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION, conversation: UNKNOWN_CONVERSATION } as unknown as ChatGptAdapterSnapshot);
  }
  if (candidate.schemaVersion !== CHATGPT_ADAPTER_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported ChatGPT adapter snapshot schema');
  requireOnly(candidate, ['schemaVersion','ready','busy','composerPresent','composerHasDraft','sendAvailable','continueAvailable','stopAvailable','assistantFingerprint','assistantMessageCount','pageAlert','conversation']);
  if (typeof candidate.composerHasDraft !== 'boolean' || !isAssistantFingerprint(candidate.assistantFingerprint)) throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot privacy fields are invalid');
  const conversation = requireConversationContext(candidate.conversation);
  return freezeJsonValue({ ...candidate, conversation } as unknown as ChatGptAdapterSnapshot);
}
