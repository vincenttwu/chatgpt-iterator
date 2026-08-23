import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import { requireEntityId, requireRevision } from '../persistence/types.ts';
import { SETTINGS_SCHEMA_VERSION, type SettingsSnapshot, type SettingsValues, type SettingsWriteInput } from './types.ts';

export const DEFAULT_HISTORY_LIMIT = 100 as const;
export const MAX_HISTORY_LIMIT = 250 as const;
export const DEFAULT_SETTINGS = freezeJsonValue({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  defaultPresetId: null,
  defaultDelaySeconds: 7,
  defaultAutoContinue: true,
  defaultAutoScroll: true,
  defaultPreventDiscard: true,
  recoveryPolicy: 'resume' as const,
  historyLimit: DEFAULT_HISTORY_LIMIT,
  appearance: 'system' as const,
});

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be boolean`);
  return value;
}

export function requireHistoryLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_HISTORY_LIMIT) {
    throw new ContractError(ERROR_CODES.invalidMessage, `historyLimit must be 1..${MAX_HISTORY_LIMIT}`);
  }
  return value as number;
}

function requireDelay(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 5 || (value as number) > 3600) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'defaultDelaySeconds must be 5..3600');
  }
  return value as number;
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new ContractError(ERROR_CODES.invalidMessage, 'settings updatedAt must be an ISO timestamp');
  return value;
}

export function requireSettingsWriteInput(value: SettingsWriteInput | Record<string, unknown>): SettingsValues {
  const raw = value as Record<string, unknown>;
  const defaultPresetId = raw.defaultPresetId === null ? null : requireEntityId(raw.defaultPresetId, 'default preset id');
  const recoveryPolicy = raw.recoveryPolicy;
  if (recoveryPolicy !== 'resume' && recoveryPolicy !== 'pause') throw new ContractError(ERROR_CODES.invalidMessage, 'recoveryPolicy must be resume|pause');
  const result: SettingsValues = {
    defaultPresetId,
    defaultDelaySeconds: requireDelay(raw.defaultDelaySeconds),
    defaultAutoContinue: bool(raw.defaultAutoContinue, 'defaultAutoContinue'),
    defaultAutoScroll: bool(raw.defaultAutoScroll, 'defaultAutoScroll'),
    defaultPreventDiscard: bool(raw.defaultPreventDiscard, 'defaultPreventDiscard'),
    recoveryPolicy,
    historyLimit: requireHistoryLimit(raw.historyLimit),
  };
  return result;
}

export function requireSettingsSnapshot(value: unknown): SettingsSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'settings snapshot must be an object');
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== SETTINGS_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported settings schema');
  if (raw.appearance !== 'system') throw new ContractError(ERROR_CODES.invalidMessage, 'appearance must remain system');
  const input = requireSettingsWriteInput(raw);
  return freezeJsonValue({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    revision: requireRevision(raw.revision, 'settings revision'),
    ...input,
    appearance: 'system' as const,
    updatedAt: requireTimestamp(raw.updatedAt),
  });
}

export function createDefaultSettings(now: string): SettingsSnapshot {
  return requireSettingsSnapshot({ ...DEFAULT_SETTINGS, revision: 1, updatedAt: now });
}
