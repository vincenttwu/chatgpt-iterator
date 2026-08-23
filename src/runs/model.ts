import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import { requireEntityId } from '../persistence/types.ts';
import {
  RUN_STATE_SCHEMA_VERSION,
  isRunActive,
  isRunTerminal,
  type DurableRunSnapshot,
  type RepeatRunState,
  type RunActiveState,
  type RunFailure,
  type RunLifecycleState,
} from './types.ts';

const LIFECYCLE = new Set<RunLifecycleState>([
  'ready', 'running', 'waiting_response', 'waiting_delay', 'paused', 'frozen', 'discarded', 'completed', 'failed', 'stopped',
]);

export const DEFAULT_REPEAT_MESSAGE = 'Continue with the next iteration.';
export const DEFAULT_REPEAT_ITERATIONS = 5;
export const DEFAULT_REPEAT_DELAY_SECONDS = 7;

function requirePositiveSafeInteger(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be a positive safe integer <= ${max}`);
  }
  return value as number;
}

function requireNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be a non-negative safe integer`);
  return value as number;
}

function requireTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || Number.isNaN(Date.parse(value))) throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be an ISO timestamp`);
  return value;
}

function optionalTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : requireTimestamp(value, label);
}

function requireFailure(value: unknown): RunFailure | null {
  if (value === null) return null;
  if (Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'run failure must be object|null');
  const raw = value as Record<string, unknown>;
  if (typeof raw.code !== 'string' || raw.code.length === 0 || raw.code.length > 64) throw new ContractError(ERROR_CODES.invalidMessage, 'run failure code must be 1..64 characters');
  if (typeof raw.message !== 'string' || raw.message.length === 0 || raw.message.length > 512) throw new ContractError(ERROR_CODES.invalidMessage, 'run failure message must be 1..512 characters');
  return freezeJsonValue({ code: raw.code, message: raw.message });
}

function requireMessage(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 65_536) {
    throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be 1..65536 characters`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be boolean`);
  return value;
}

export function requireRepeatRunState(value: unknown): RepeatRunState {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'repeat execution state must be object');
  const raw = value as Record<string, unknown>;
  if (raw.mode !== 'repeat') throw new ContractError(ERROR_CODES.invalidMessage, 'run execution mode must be repeat');
  const totalIterations = requirePositiveSafeInteger(raw.totalIterations, 'totalIterations', 10_000);
  const completedIterations = requireNonNegativeSafeInteger(raw.completedIterations, 'completedIterations');
  if (completedIterations > totalIterations) throw new ContractError(ERROR_CODES.invalidMessage, 'completedIterations cannot exceed totalIterations');
  const activeIteration = raw.activeIteration === null ? null : requirePositiveSafeInteger(raw.activeIteration, 'activeIteration', totalIterations);
  const activeMessage = raw.activeMessage === null ? null : requireMessage(raw.activeMessage, 'activeMessage');
  if ((activeIteration === null) !== (activeMessage === null)) throw new ContractError(ERROR_CODES.invalidMessage, 'activeIteration and activeMessage must be present together');
  if (activeIteration !== null && activeIteration !== completedIterations + 1) throw new ContractError(ERROR_CODES.invalidMessage, 'activeIteration must be the next uncompleted iteration');
  const delaySeconds = requirePositiveSafeInteger(raw.delaySeconds, 'delaySeconds', 3_600);
  if (delaySeconds < 5) throw new ContractError(ERROR_CODES.invalidMessage, 'delaySeconds must be at least 5');
  const baseline = raw.assistantBaselineSignature;
  if (!(baseline === null || (typeof baseline === 'string' && baseline.length <= 4_096))) throw new ContractError(ERROR_CODES.invalidMessage, 'assistantBaselineSignature must be string|null');
  return freezeJsonValue({
    mode: 'repeat' as const,
    messageTemplate: requireMessage(raw.messageTemplate, 'messageTemplate'),
    totalIterations,
    completedIterations,
    activeIteration,
    activeMessage,
    delaySeconds,
    autoContinue: requireBoolean(raw.autoContinue, 'autoContinue'),
    autoScroll: requireBoolean(raw.autoScroll, 'autoScroll'),
    preventDiscard: raw.preventDiscard === undefined ? true : requireBoolean(raw.preventDiscard, 'preventDiscard'),
    assistantBaselineSignature: baseline as string | null,
    nextDueAt: optionalTimestamp(raw.nextDueAt, 'nextDueAt'),
  });
}

export function createRepeatRunState(input: {
  messageTemplate?: unknown;
  totalIterations?: unknown;
  delaySeconds?: unknown;
  autoContinue?: unknown;
  autoScroll?: unknown;
  preventDiscard?: unknown;
} = {}): RepeatRunState {
  return requireRepeatRunState({
    mode: 'repeat',
    messageTemplate: input.messageTemplate ?? DEFAULT_REPEAT_MESSAGE,
    totalIterations: input.totalIterations ?? DEFAULT_REPEAT_ITERATIONS,
    completedIterations: 0,
    activeIteration: null,
    activeMessage: null,
    delaySeconds: input.delaySeconds ?? DEFAULT_REPEAT_DELAY_SECONDS,
    autoContinue: input.autoContinue ?? true,
    autoScroll: input.autoScroll ?? true,
    preventDiscard: input.preventDiscard ?? true,
    assistantBaselineSignature: null,
    nextDueAt: null,
  });
}

export function requireRunSnapshot(value: unknown): DurableRunSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'run state must be an object');
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== RUN_STATE_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported run state schema');
  const id = requireEntityId(raw.id, 'run id');
  const generation = requirePositiveSafeInteger(raw.generation, 'run generation');
  if (typeof raw.lifecycleState !== 'string' || !LIFECYCLE.has(raw.lifecycleState as RunLifecycleState)) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid run lifecycle state');
  const lifecycleState = raw.lifecycleState as RunLifecycleState;
  const targetTabId = requireNonNegativeSafeInteger(raw.targetTabId, 'targetTabId');
  const targetWindowId = requireNonNegativeSafeInteger(raw.targetWindowId, 'targetWindowId');
  const resumeState = raw.resumeState === null ? null : raw.resumeState;
  if (!(resumeState === null || (typeof resumeState === 'string' && isRunActive(resumeState as RunLifecycleState)))) throw new ContractError(ERROR_CODES.invalidMessage, 'resumeState must be active state|null');
  const failure = requireFailure(raw.failure);
  if (lifecycleState === 'failed' && failure === null) throw new ContractError(ERROR_CODES.invalidMessage, 'failed run requires failure detail');
  if (lifecycleState !== 'failed' && failure !== null) throw new ContractError(ERROR_CODES.invalidMessage, 'only failed run may carry failure detail');
  const execution = raw.execution === undefined ? createRepeatRunState() : requireRepeatRunState(raw.execution);
  return freezeJsonValue({
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    id,
    generation,
    lifecycleState,
    targetTabId,
    targetWindowId,
    resumeState: resumeState as RunActiveState | null,
    failure,
    execution,
    createdAt: requireTimestamp(raw.createdAt, 'createdAt'),
    updatedAt: requireTimestamp(raw.updatedAt, 'updatedAt'),
  });
}

export function createReadyRun(input: {
  id: string;
  targetTabId: number;
  targetWindowId: number;
  now: string;
  execution?: RepeatRunState;
}): DurableRunSnapshot {
  return requireRunSnapshot({
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    id: requireEntityId(input.id, 'run id'),
    generation: 1,
    lifecycleState: 'ready',
    targetTabId: input.targetTabId,
    targetWindowId: input.targetWindowId,
    resumeState: null,
    failure: null,
    execution: input.execution ?? createRepeatRunState(),
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function nextRunState(current: DurableRunSnapshot, input: {
  lifecycleState: RunLifecycleState;
  now: string;
  resumeState?: RunActiveState | null;
  failure?: RunFailure | null;
  execution?: RepeatRunState;
}): DurableRunSnapshot {
  if (isRunTerminal(current.lifecycleState)) throw new ContractError(ERROR_CODES.staleRequest, `run is terminal: ${current.lifecycleState}`);
  return requireRunSnapshot({
    ...current,
    generation: current.generation + 1,
    lifecycleState: input.lifecycleState,
    resumeState: input.resumeState ?? null,
    failure: input.failure ?? null,
    execution: input.execution ?? current.execution,
    updatedAt: input.now,
  } as JsonObject);
}
