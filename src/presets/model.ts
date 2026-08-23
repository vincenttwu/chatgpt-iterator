import { ContractError, ERROR_CODES } from '../core/index.ts';
import type { PresetRecord } from '../persistence/types.ts';
import { requireEntityId, requireRevision } from '../persistence/types.ts';
import { PRESET_SCHEMA_VERSION, type PresetMode, type PresetWriteInput } from './types.ts';

export const PRESET_NAME_MAX = 120 as const;
export const PRESET_ITERATION_MAX = 10_000 as const;
export const PRESET_DELAY_MIN = 5 as const;
export const PRESET_DELAY_MAX = 3_600 as const;

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be boolean`);
  return value;
}

function requireInteger(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be an integer from ${min} to ${max}`);
  }
  return value as number;
}

function requireOptionalEntityId(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireEntityId(value, label);
}

export function requirePresetName(value: unknown): string {
  if (typeof value !== 'string') throw new ContractError(ERROR_CODES.invalidMessage, 'preset name must be a string');
  const name = value.trim();
  if (name.length < 1 || name.length > PRESET_NAME_MAX) {
    throw new ContractError(ERROR_CODES.invalidMessage, `preset name must be 1..${PRESET_NAME_MAX} characters`);
  }
  return name;
}

export function requirePresetMode(value: unknown): PresetMode {
  if (value !== 'repeat' && value !== 'queue') throw new ContractError(ERROR_CODES.invalidMessage, 'preset mode must be repeat|queue');
  return value;
}

export function requirePresetWriteInput(value: unknown): PresetWriteInput {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ContractError(ERROR_CODES.invalidMessage, 'preset input must be an object');
  }
  const raw = value as Record<string, unknown>;
  const mode = requirePresetMode(raw.mode);
  const templateId = requireOptionalEntityId(raw.templateId, 'preset templateId');
  const queueId = requireOptionalEntityId(raw.queueId, 'preset queueId');
  if (mode === 'repeat' && (templateId === null || queueId !== null)) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'repeat preset requires templateId and no queueId');
  }
  if (mode === 'queue' && (queueId === null || templateId !== null)) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'queue preset requires queueId and no templateId');
  }
  return {
    name: requirePresetName(raw.name),
    mode,
    templateId,
    queueId,
    iterationCount: requireInteger(raw.iterationCount, 'iterationCount', 1, PRESET_ITERATION_MAX),
    delaySeconds: requireInteger(raw.delaySeconds, 'delaySeconds', PRESET_DELAY_MIN, PRESET_DELAY_MAX),
    autoContinue: requireBoolean(raw.autoContinue, 'autoContinue'),
    autoScroll: requireBoolean(raw.autoScroll, 'autoScroll'),
    preventDiscard: requireBoolean(raw.preventDiscard, 'preventDiscard'),
  };
}

export function createPresetRecord(input: PresetWriteInput, id: string, now: string): PresetRecord {
  requireEntityId(id, 'preset id');
  return Object.freeze({
    schemaVersion: PRESET_SCHEMA_VERSION,
    id,
    revision: 1,
    ...requirePresetWriteInput(input),
    createdAt: now,
    updatedAt: now,
  });
}

export function updatePresetRecord(current: PresetRecord, input: PresetWriteInput, now: string): PresetRecord {
  requireRevision(current.revision, 'preset revision');
  return Object.freeze({
    ...current,
    ...requirePresetWriteInput(input),
    revision: current.revision + 1,
    updatedAt: now,
  });
}
