import type { JsonObject } from '../core/types.ts';
import { EXPORT_FORMAT_VERSION } from '../persistence/versions.ts';
import type { PresetRecord, QueueItemRecord, QueueRecord, TemplateRecord } from '../persistence/types.ts';
import type { DurableRunSnapshot } from '../runs/types.ts';
import type { SettingsValues } from '../settings/types.ts';

export const PORTABLE_PRODUCT = 'chatgpt-iterator' as const;
export const PORTABLE_SCHEMA_VERSION = 1 as const;
export const PORTABLE_FORMAT_VERSION = EXPORT_FORMAT_VERSION;
export const PORTABILITY_RUNTIME_OPERATIONS = Object.freeze({
  export: 'portability.export',
  preview: 'portability.preview',
  apply: 'portability.apply',
} as const);

export type PortableKind = 'configuration' | 'full_backup';
export type ImportMode = 'merge' | 'replace_imported' | 'replace_all';

export interface PortableSettings extends JsonObject, SettingsValues {}
export interface PortableQueue extends JsonObject {
  readonly queue: QueueRecord;
  readonly items: QueueItemRecord[];
}
export interface PortableRunEvent extends JsonObject {
  readonly id: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly payload: JsonObject;
  readonly occurredAt: string;
}
export interface PortableHistoryRun extends JsonObject {
  readonly run: DurableRunSnapshot;
  readonly events: PortableRunEvent[];
}
export interface PortableData extends JsonObject {
  readonly templates: TemplateRecord[];
  readonly presets: PresetRecord[];
  readonly queues: PortableQueue[];
  readonly settings: PortableSettings;
  readonly history?: PortableHistoryRun[];
}
export interface PortableEnvelope extends JsonObject {
  readonly product: typeof PORTABLE_PRODUCT;
  readonly formatVersion: typeof PORTABLE_FORMAT_VERSION;
  readonly kind: PortableKind;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly data: PortableData;
}
export interface PortableCounts extends JsonObject {
  readonly templates: number;
  readonly presets: number;
  readonly queues: number;
  readonly queueItems: number;
  readonly historyRuns: number;
  readonly historyEvents: number;
}
export interface PortableConflicts extends JsonObject {
  readonly templates: number;
  readonly presets: number;
  readonly queues: number;
  readonly historyRuns: number;
  readonly historyEvents: number;
}
export interface ImportPreview extends JsonObject {
  readonly schemaVersion: typeof PORTABLE_SCHEMA_VERSION;
  readonly product: typeof PORTABLE_PRODUCT;
  readonly formatVersion: number;
  readonly kind: PortableKind;
  readonly sourceAppVersion: string;
  readonly exportedAt: string;
  readonly mode: ImportMode;
  readonly counts: PortableCounts;
  readonly conflicts: PortableConflicts;
  readonly planFingerprint: string;
  readonly warnings: string[];
}
export interface ImportApplyResult extends JsonObject {
  readonly schemaVersion: typeof PORTABLE_SCHEMA_VERSION;
  readonly mode: ImportMode;
  readonly kind: PortableKind;
  readonly applied: PortableCounts;
}
