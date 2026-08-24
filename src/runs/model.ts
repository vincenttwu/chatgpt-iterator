import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import { requireEntityId, requireRevision } from '../persistence/types.ts';
import { assistantFingerprintFromLegacySignature, isAssistantFingerprint } from '../chatgpt/fingerprint.ts';
import { conversationBindingFromContext, requireRunConversationBinding } from './conversation.ts';
import type { ChatGptConversationContext } from '../chatgpt/types.ts';
import {
  RUN_STATE_SCHEMA_VERSION,
  isRunActive,
  isRunTerminal,
  type DurableRunSnapshot,
  type QueueRunItem,
  type QueueRunState,
  type RepeatRunState,
  type RunActiveState,
  type RunConversationBinding,
  type RunExecutionState,
  type RunFailure,
  type RunLifecycleState,
  type RunSuspensionReason,
} from './types.ts';

const LIFECYCLE = new Set<RunLifecycleState>(['ready','running','waiting_response','waiting_delay','paused','frozen','discarded','reconnecting','completed','failed','stopped']);
const SUSPENSION_REASONS = new Set<Exclude<RunSuspensionReason, null>>(['user','tab_frozen','tab_discarded','tab_reconnecting','browser_session_reset','worker_recovery_policy','conversation_changed']);
export const DEFAULT_REPEAT_MESSAGE = 'Continue with the next iteration.';
export const DEFAULT_REPEAT_ITERATIONS = 5;
export const DEFAULT_REPEAT_DELAY_SECONDS = 7;

function pos(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be a positive safe integer <= ${max}`);
  return value as number;
}
function nonneg(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be a non-negative safe integer`);
  return value as number;
}
function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be an ISO timestamp`);
  return value;
}
function optionalTimestamp(value: unknown, label: string): string|null { return value === null ? null : timestamp(value, label); }
function message(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 65536) throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be 1..65536 characters`);
  return value;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be boolean`);
  return value;
}
function failure(value: unknown): RunFailure|null {
  if (value === null) return null;
  if (Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'run failure must be object|null');
  const raw = value as Record<string, unknown>;
  if (typeof raw.code !== 'string' || !raw.code || raw.code.length > 64 || typeof raw.message !== 'string' || !raw.message || raw.message.length > 512) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid run failure');
  return freezeJsonValue({ code: raw.code, message: raw.message });
}
function optionalDelay(value: unknown): number|null {
  if (value === null) return null;
  const number = pos(value, 'activeDelayAfterSeconds', 3600);
  if (number < 5) throw new ContractError(ERROR_CODES.invalidMessage, 'delay must be at least 5 seconds');
  return number;
}

function suspensionReason(value: unknown, lifecycleState: RunLifecycleState): RunSuspensionReason {
  if (value === undefined || value === null) {
    if (lifecycleState === 'frozen') return 'tab_frozen';
    if (lifecycleState === 'discarded') return 'tab_discarded';
    if (lifecycleState === 'reconnecting') return 'tab_reconnecting';
    if (lifecycleState === 'paused') return 'user';
    return null;
  }
  if (typeof value !== 'string' || !SUSPENSION_REASONS.has(value as Exclude<RunSuspensionReason, null>)) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid run suspensionReason');
  return value as Exclude<RunSuspensionReason, null>;
}

function common(raw: Record<string, unknown>) {
  const totalIterations = pos(raw.totalIterations, 'totalIterations', 10000);
  const completedIterations = nonneg(raw.completedIterations, 'completedIterations');
  if (completedIterations > totalIterations) throw new ContractError(ERROR_CODES.invalidMessage, 'completedIterations cannot exceed totalIterations');
  const activeIteration = raw.activeIteration === null ? null : pos(raw.activeIteration, 'activeIteration', totalIterations);
  const activeMessage = raw.activeMessage === null ? null : message(raw.activeMessage, 'activeMessage');
  if ((activeIteration === null) !== (activeMessage === null)) throw new ContractError(ERROR_CODES.invalidMessage, 'activeIteration and activeMessage must be present together');
  if (activeIteration !== null && activeIteration !== completedIterations + 1) throw new ContractError(ERROR_CODES.invalidMessage, 'activeIteration must be the next uncompleted iteration');
  const delaySeconds = pos(raw.delaySeconds, 'delaySeconds', 3600);
  if (delaySeconds < 5) throw new ContractError(ERROR_CODES.invalidMessage, 'delaySeconds must be at least 5');
  const modernBaseline = raw.assistantBaselineFingerprint;
  const legacyBaseline = raw.assistantBaselineSignature;
  if (modernBaseline !== undefined && legacyBaseline !== undefined) throw new ContractError(ERROR_CODES.invalidMessage, 'run execution cannot contain both assistant baseline fields');
  let assistantBaselineFingerprint: string|null;
  if (modernBaseline === undefined) {
    if (!(legacyBaseline === null || legacyBaseline === undefined || (typeof legacyBaseline === 'string' && legacyBaseline.length <= 4096))) throw new ContractError(ERROR_CODES.invalidMessage, 'legacy assistant baseline must be string|null');
    assistantBaselineFingerprint = typeof legacyBaseline === 'string' ? assistantFingerprintFromLegacySignature(legacyBaseline) : null;
  } else {
    if (!(modernBaseline === null || isAssistantFingerprint(modernBaseline))) throw new ContractError(ERROR_CODES.invalidMessage, 'assistantBaselineFingerprint must be opaque fingerprint|null');
    assistantBaselineFingerprint = modernBaseline as string|null;
  }
  return {
    totalIterations,
    completedIterations,
    activeIteration,
    activeMessage,
    activeDelayAfterSeconds: optionalDelay(raw.activeDelayAfterSeconds ?? null),
    delaySeconds,
    autoContinue: bool(raw.autoContinue, 'autoContinue'),
    autoScroll: bool(raw.autoScroll, 'autoScroll'),
    preventDiscard: raw.preventDiscard === undefined ? true : bool(raw.preventDiscard, 'preventDiscard'),
    assistantBaselineFingerprint,
    nextDueAt: optionalTimestamp(raw.nextDueAt, 'nextDueAt'),
  };
}

export function requireRepeatRunState(value: unknown): RepeatRunState {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'repeat execution state must be object');
  const raw = value as Record<string, unknown>;
  if (raw.mode !== 'repeat') throw new ContractError(ERROR_CODES.invalidMessage, 'run execution mode must be repeat');
  return freezeJsonValue({ mode: 'repeat', messageTemplate: message(raw.messageTemplate, 'messageTemplate'), ...common(raw) });
}

function requireQueueItem(value: unknown): QueueRunItem {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'queue run item must be object');
  const raw = value as Record<string, unknown>;
  const source = raw.source;
  if (source !== 'literal' && source !== 'template') throw new ContractError(ERROR_CODES.invalidMessage, 'queue run item source must be literal|template');
  const templateId = raw.templateId === null ? null : requireEntityId(raw.templateId, 'queue run item template id');
  const templateRevision = raw.templateRevision === null ? null : requireRevision(raw.templateRevision, 'queue run item template revision');
  if (source === 'literal' && (templateId !== null || templateRevision !== null)) throw new ContractError(ERROR_CODES.invalidMessage, 'literal queue run item cannot carry template provenance');
  if (source === 'template' && (templateId === null || templateRevision === null)) throw new ContractError(ERROR_CODES.invalidMessage, 'template queue run item requires template provenance');
  return freezeJsonValue({ id: requireEntityId(raw.id, 'queue run item id'), position: nonneg(raw.position, 'queue run item position'), source, templateId, templateRevision, content: message(raw.content, 'queue run item content'), delayAfterSeconds: optionalDelay(raw.delayAfterSeconds) });
}

export function requireQueueRunState(value: unknown): QueueRunState {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'queue execution state must be object');
  const raw = value as Record<string, unknown>;
  if (raw.mode !== 'queue') throw new ContractError(ERROR_CODES.invalidMessage, 'run execution mode must be queue');
  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 1000) throw new ContractError(ERROR_CODES.invalidMessage, 'queue execution items must be 1..1000 items');
  const items = raw.items.map(requireQueueItem);
  const parsedCommon = common(raw);
  if (parsedCommon.totalIterations !== items.length) throw new ContractError(ERROR_CODES.invalidMessage, 'queue totalIterations must equal resolved item count');
  return freezeJsonValue({ mode: 'queue', queueId: requireEntityId(raw.queueId, 'queue id'), queueRevision: requireRevision(raw.queueRevision, 'queue revision'), items, ...parsedCommon });
}

export function requireRunExecutionState(value: unknown): RunExecutionState {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'run execution state must be object');
  return (value as Record<string, unknown>).mode === 'queue' ? requireQueueRunState(value) : requireRepeatRunState(value);
}

export function createRepeatRunState(input: { messageTemplate?:unknown; totalIterations?:unknown; delaySeconds?:unknown; autoContinue?:unknown; autoScroll?:unknown; preventDiscard?:unknown } = {}): RepeatRunState {
  return requireRepeatRunState({ mode:'repeat', messageTemplate:input.messageTemplate ?? DEFAULT_REPEAT_MESSAGE, totalIterations:input.totalIterations ?? DEFAULT_REPEAT_ITERATIONS, completedIterations:0, activeIteration:null, activeMessage:null, activeDelayAfterSeconds:null, delaySeconds:input.delaySeconds ?? DEFAULT_REPEAT_DELAY_SECONDS, autoContinue:input.autoContinue ?? true, autoScroll:input.autoScroll ?? true, preventDiscard:input.preventDiscard ?? true, assistantBaselineFingerprint:null, nextDueAt:null });
}

export function createQueueRunState(input: { queueId:unknown; queueRevision:unknown; items:unknown; delaySeconds?:unknown; autoContinue?:unknown; autoScroll?:unknown; preventDiscard?:unknown }): QueueRunState {
  const items = Array.isArray(input.items) ? input.items : [];
  return requireQueueRunState({ mode:'queue', queueId:input.queueId, queueRevision:input.queueRevision, items, totalIterations:items.length, completedIterations:0, activeIteration:null, activeMessage:null, activeDelayAfterSeconds:null, delaySeconds:input.delaySeconds ?? DEFAULT_REPEAT_DELAY_SECONDS, autoContinue:input.autoContinue ?? true, autoScroll:input.autoScroll ?? true, preventDiscard:input.preventDiscard ?? true, assistantBaselineFingerprint:null, nextDueAt:null });
}

export function requireRunSnapshot(value: unknown): DurableRunSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'run state must be an object');
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2 && raw.schemaVersion !== RUN_STATE_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported run state schema');
  const lifecycleState = raw.lifecycleState;
  if (typeof lifecycleState !== 'string' || !LIFECYCLE.has(lifecycleState as RunLifecycleState)) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid run lifecycle state');
  const resumeState = raw.resumeState === null ? null : raw.resumeState;
  if (!(resumeState === null || (typeof resumeState === 'string' && isRunActive(resumeState as RunLifecycleState)))) throw new ContractError(ERROR_CODES.invalidMessage, 'resumeState must be active state|null');
  const parsedFailure = failure(raw.failure);
  if (lifecycleState === 'failed' && parsedFailure === null) throw new ContractError(ERROR_CODES.invalidMessage, 'failed run requires failure detail');
  if (lifecycleState !== 'failed' && parsedFailure !== null) throw new ContractError(ERROR_CODES.invalidMessage, 'only failed run may carry failure detail');
  const conversationBinding: RunConversationBinding = raw.schemaVersion === RUN_STATE_SCHEMA_VERSION
    ? requireRunConversationBinding(raw.conversationBinding)
    : freezeJsonValue({ kind: 'unbound' as const, conversationId: null });
  return freezeJsonValue({
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    id: requireEntityId(raw.id, 'run id'),
    generation: pos(raw.generation, 'run generation'),
    lifecycleState: lifecycleState as RunLifecycleState,
    targetTabId: nonneg(raw.targetTabId, 'targetTabId'),
    targetWindowId: nonneg(raw.targetWindowId, 'targetWindowId'),
    conversationBinding,
    resumeState: resumeState as RunActiveState|null,
    suspensionReason: suspensionReason(raw.suspensionReason, lifecycleState as RunLifecycleState),
    failure: parsedFailure,
    execution: raw.execution === undefined ? createRepeatRunState() : requireRunExecutionState(raw.execution),
    createdAt: timestamp(raw.createdAt, 'createdAt'),
    updatedAt: timestamp(raw.updatedAt, 'updatedAt'),
  });
}

export function createReadyRun(input: { id:string; targetTabId:number; targetWindowId:number; now:string; execution?:RunExecutionState; conversationContext?:ChatGptConversationContext }): DurableRunSnapshot {
  return requireRunSnapshot({ schemaVersion:RUN_STATE_SCHEMA_VERSION, id:input.id, generation:1, lifecycleState:'ready', targetTabId:input.targetTabId, targetWindowId:input.targetWindowId, conversationBinding:conversationBindingFromContext(input.conversationContext), resumeState:null, suspensionReason:null, failure:null, execution:input.execution ?? createRepeatRunState(), createdAt:input.now, updatedAt:input.now });
}

export function nextRunState(current: DurableRunSnapshot, input: { lifecycleState:RunLifecycleState; now:string; resumeState?:RunActiveState|null; suspensionReason?:RunSuspensionReason; failure?:RunFailure|null; execution?:RunExecutionState; targetTabId?:number; targetWindowId?:number; conversationBinding?:RunConversationBinding }): DurableRunSnapshot {
  if (isRunTerminal(current.lifecycleState)) throw new ContractError(ERROR_CODES.staleRequest, `run is terminal: ${current.lifecycleState}`);
  return requireRunSnapshot({ ...current, generation:current.generation + 1, lifecycleState:input.lifecycleState, targetTabId:input.targetTabId ?? current.targetTabId, targetWindowId:input.targetWindowId ?? current.targetWindowId, conversationBinding:input.conversationBinding ?? current.conversationBinding, resumeState:input.resumeState ?? null, suspensionReason:input.suspensionReason ?? null, failure:input.failure ?? null, execution:input.execution ?? current.execution, updatedAt:input.now } as JsonObject);
}
