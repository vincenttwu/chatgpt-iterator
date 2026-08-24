import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { ChatGptAdapterSnapshot, ChatGptConversationContext, ChatGptDegradationCode } from './types.ts';
import { CHATGPT_ADAPTER_SCHEMA_VERSION } from './types.ts';
import { assistantFingerprintFromLegacySignature, isAssistantFingerprint } from './fingerprint.ts';
import { requireConversationContext } from './conversation.ts';

const BOOLEAN_FIELDS = ['ready', 'busy', 'composerPresent', 'sendAvailable', 'continueAvailable', 'stopAvailable'] as const;
const DEGRADATION_CODES = new Set<ChatGptDegradationCode>(['unsupported_route','composer_missing','composer_ambiguous','capability_unavailable','conversation_mismatch','likely_rate_limited','page_alert','adapter_drift']);
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

function legacyCodes(candidate: Record<string, unknown>, conversation: ChatGptConversationContext = UNKNOWN_CONVERSATION): ChatGptDegradationCode[] {
  const codes: ChatGptDegradationCode[] = [];
  if (candidate.composerPresent === false) codes.push('composer_missing');
  if (candidate.pageAlert !== null) codes.push('page_alert');
  if (conversation.kind === 'unsupported' && conversation.pathname !== '') codes.push('unsupported_route');
  return codes;
}

function requireCodes(value: unknown): ChatGptDegradationCode[] {
  if (!Array.isArray(value)) throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot degradationCodes must be an array');
  const codes: ChatGptDegradationCode[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !DEGRADATION_CODES.has(item as ChatGptDegradationCode)) throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot contains invalid degradation code');
    if (!codes.includes(item as ChatGptDegradationCode)) codes.push(item as ChatGptDegradationCode);
  }
  return codes;
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
      degradationCodes: legacyCodes(candidate),
      conversation: UNKNOWN_CONVERSATION,
    });
  }
  if (candidate.schemaVersion === 2) {
    requireOnly(candidate, ['schemaVersion','ready','busy','composerPresent','composerHasDraft','sendAvailable','continueAvailable','stopAvailable','assistantFingerprint','assistantMessageCount','pageAlert']);
    if (typeof candidate.composerHasDraft !== 'boolean' || !isAssistantFingerprint(candidate.assistantFingerprint)) throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot privacy fields are invalid');
    return freezeJsonValue({ ...candidate, schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION, degradationCodes: legacyCodes(candidate), conversation: UNKNOWN_CONVERSATION } as unknown as ChatGptAdapterSnapshot);
  }
  if (candidate.schemaVersion === 3) {
    requireOnly(candidate, ['schemaVersion','ready','busy','composerPresent','composerHasDraft','sendAvailable','continueAvailable','stopAvailable','assistantFingerprint','assistantMessageCount','pageAlert','conversation']);
    if (typeof candidate.composerHasDraft !== 'boolean' || !isAssistantFingerprint(candidate.assistantFingerprint)) throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot privacy fields are invalid');
    const conversation = requireConversationContext(candidate.conversation);
    return freezeJsonValue({ ...candidate, schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION, degradationCodes: legacyCodes(candidate, conversation), conversation } as unknown as ChatGptAdapterSnapshot);
  }
  if (candidate.schemaVersion !== CHATGPT_ADAPTER_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported ChatGPT adapter snapshot schema');
  requireOnly(candidate, ['schemaVersion','ready','busy','composerPresent','composerHasDraft','sendAvailable','continueAvailable','stopAvailable','assistantFingerprint','assistantMessageCount','pageAlert','degradationCodes','conversation']);
  if (typeof candidate.composerHasDraft !== 'boolean' || !isAssistantFingerprint(candidate.assistantFingerprint)) throw new ContractError(ERROR_CODES.invalidMessage, 'adapter snapshot privacy fields are invalid');
  const conversation = requireConversationContext(candidate.conversation);
  const degradationCodes = requireCodes(candidate.degradationCodes);
  return freezeJsonValue({ ...candidate, degradationCodes, conversation } as unknown as ChatGptAdapterSnapshot);
}
