import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import { requireEntityId } from '../persistence/types.ts';
import {
  RUN_STATE_SCHEMA_VERSION,
  isRunActive,
  isRunTerminal,
  type DurableRunSnapshot,
  type RunActiveState,
  type RunFailure,
  type RunLifecycleState,
} from './types.ts';

const LIFECYCLE = new Set<RunLifecycleState>([
  'ready', 'running', 'waiting_response', 'waiting_delay', 'paused', 'frozen', 'discarded', 'completed', 'failed', 'stopped',
]);

function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be a positive safe integer`);
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

function requireFailure(value: unknown): RunFailure | null {
  if (value === null) return null;
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'run failure must be object|null');
  const raw = value as Record<string, unknown>;
  if (typeof raw.code !== 'string' || raw.code.length === 0 || raw.code.length > 64) throw new ContractError(ERROR_CODES.invalidMessage, 'run failure code must be 1..64 characters');
  if (typeof raw.message !== 'string' || raw.message.length === 0 || raw.message.length > 512) throw new ContractError(ERROR_CODES.invalidMessage, 'run failure message must be 1..512 characters');
  return freezeJsonValue({ code: raw.code, message: raw.message });
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
  return freezeJsonValue({
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    id,
    generation,
    lifecycleState,
    targetTabId,
    targetWindowId,
    resumeState: resumeState as RunActiveState | null,
    failure,
    createdAt: requireTimestamp(raw.createdAt, 'createdAt'),
    updatedAt: requireTimestamp(raw.updatedAt, 'updatedAt'),
  });
}

export function createReadyRun(input: { id: string; targetTabId: number; targetWindowId: number; now: string }): DurableRunSnapshot {
  return requireRunSnapshot({
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    id: requireEntityId(input.id, 'run id'),
    generation: 1,
    lifecycleState: 'ready',
    targetTabId: input.targetTabId,
    targetWindowId: input.targetWindowId,
    resumeState: null,
    failure: null,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function nextRunState(current: DurableRunSnapshot, input: {
  lifecycleState: RunLifecycleState;
  now: string;
  resumeState?: RunActiveState | null;
  failure?: RunFailure | null;
}): DurableRunSnapshot {
  if (isRunTerminal(current.lifecycleState)) throw new ContractError(ERROR_CODES.staleRequest, `run is terminal: ${current.lifecycleState}`);
  return requireRunSnapshot({
    ...current,
    generation: current.generation + 1,
    lifecycleState: input.lifecycleState,
    resumeState: input.resumeState ?? null,
    failure: input.failure ?? null,
    updatedAt: input.now,
  } as JsonObject);
}
