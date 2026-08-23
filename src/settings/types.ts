import type { JsonObject } from '../core/types.ts';

export const SETTINGS_SCHEMA_VERSION = 1 as const;
export const SETTINGS_STORAGE_KEY = 'preferences.v1' as const;
export const SETTINGS_RUNTIME_OPERATIONS = Object.freeze({
  get: 'settings.get',
  update: 'settings.update',
} as const);

export type RecoveryPolicy = 'resume' | 'pause';
export type AppearanceMode = 'system';

export interface SettingsValues {
  readonly defaultPresetId: string | null;
  readonly defaultDelaySeconds: number;
  readonly defaultAutoContinue: boolean;
  readonly defaultAutoScroll: boolean;
  readonly defaultPreventDiscard: boolean;
  readonly recoveryPolicy: RecoveryPolicy;
  readonly historyLimit: number;
}

export interface SettingsSnapshot extends JsonObject, SettingsValues {
  readonly schemaVersion: number;
  readonly revision: number;
  readonly appearance: AppearanceMode;
  readonly updatedAt: string;
}

export interface SettingsWriteInput {
  readonly defaultPresetId: unknown;
  readonly defaultDelaySeconds: unknown;
  readonly defaultAutoContinue: unknown;
  readonly defaultAutoScroll: unknown;
  readonly defaultPreventDiscard: unknown;
  readonly recoveryPolicy: unknown;
  readonly historyLimit: unknown;
}
