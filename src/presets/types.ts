import type { JsonObject } from '../core/types.ts';
import type { PresetRecord, QueueRecord, TemplateRecord } from '../persistence/types.ts';

export const PRESET_SCHEMA_VERSION = 1 as const;
export const PRESET_RUNTIME_OPERATIONS = Object.freeze({
  list: 'preset.list',
  get: 'preset.get',
  references: 'preset.references',
  create: 'preset.create',
  update: 'preset.update',
  duplicate: 'preset.duplicate',
  delete: 'preset.delete',
  hydrate: 'preset.hydrate',
} as const);

export type PresetMode = 'repeat' | 'queue';
export type PresetSnapshot = PresetRecord;

export interface PresetWriteInput extends JsonObject {
  readonly name: string;
  readonly mode: PresetMode;
  readonly templateId: string | null;
  readonly queueId: string | null;
  readonly iterationCount: number;
  readonly delaySeconds: number;
  readonly autoContinue: boolean;
  readonly autoScroll: boolean;
  readonly preventDiscard: boolean;
}

export interface PresetTemplateReference extends JsonObject {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly enabled: boolean;
}

export interface PresetQueueReference extends JsonObject {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
}

export interface PresetReferenceCatalog extends JsonObject {
  readonly templates: PresetTemplateReference[];
  readonly queues: PresetQueueReference[];
}

export interface RepeatPresetHydration extends JsonObject {
  readonly schemaVersion: 1;
  readonly mode: 'repeat';
  readonly preset: PresetRecord;
  readonly template: TemplateRecord;
  readonly messageTemplate: string;
  readonly totalIterations: number;
  readonly delaySeconds: number;
  readonly autoContinue: boolean;
  readonly autoScroll: boolean;
  readonly preventDiscard: boolean;
}

export interface QueuePresetHydration extends JsonObject {
  readonly schemaVersion: 1;
  readonly mode: 'queue';
  readonly preset: PresetRecord;
  readonly queue: QueueRecord;
  readonly delaySeconds: number;
  readonly autoContinue: boolean;
  readonly autoScroll: boolean;
  readonly preventDiscard: boolean;
}

export type PresetHydration = RepeatPresetHydration | QueuePresetHydration;
