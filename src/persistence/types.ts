import type { JsonObject, JsonValue } from '../core/types.ts';
import { assertJsonSafe, freezeJsonValue } from '../core/json.ts';
import { PERSISTENCE_SCHEMA_VERSION } from './versions.ts';

export type PersistenceStoreName =
  | 'metadata'
  | 'templates'
  | 'presets'
  | 'queues'
  | 'queueItems'
  | 'runs'
  | 'runEvents';

export const PERSISTENCE_STORES: readonly PersistenceStoreName[] = Object.freeze([
  'metadata',
  'templates',
  'presets',
  'queues',
  'queueItems',
  'runs',
  'runEvents',
]);

export interface MetadataRecord extends JsonObject {
  readonly key: string;
  readonly value: JsonValue;
  readonly updatedAt: string;
}

export interface TemplateRecord extends JsonObject {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly body: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PresetRecord extends JsonObject {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly mode: 'repeat' | 'queue';
  readonly templateId: string | null;
  readonly queueId: string | null;
  readonly iterationCount: number;
  readonly delaySeconds: number;
  readonly autoContinue: boolean;
  readonly autoScroll: boolean;
  readonly preventDiscard: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QueueRecord extends JsonObject {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QueueItemRecord extends JsonObject {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly queueId: string;
  readonly position: number;
  readonly message: string | null;
  readonly templateId: string | null;
  readonly enabled: boolean;
  readonly delayAfterSeconds: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * STEP-06 intentionally leaves execution-state vocabulary opaque. STEP-07 owns the
 * run state machine. The durable envelope and physical store exist now so STEP-07
 * can evolve logical run payloads without a physical IndexedDB version bump.
 */
export interface RunRecord extends JsonObject {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly logicalVersion: number;
  readonly state: JsonObject;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RunEventRecord extends JsonObject {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly payload: JsonObject;
  readonly occurredAt: string;
}

export interface StoreRecordMap {
  metadata: MetadataRecord;
  templates: TemplateRecord;
  presets: PresetRecord;
  queues: QueueRecord;
  queueItems: QueueItemRecord;
  runs: RunRecord;
  runEvents: RunEventRecord;
}

export type StoreRecord<S extends PersistenceStoreName> = StoreRecordMap[S];

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireEntityId(value: unknown, label = 'entity id'): string {
  if (typeof value !== 'string' || !UUID_V4.test(value)) throw new TypeError(`${label} must be a UUID v4`);
  return value;
}

export function requireRevision(value: unknown, label = 'revision'): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return value as number;
}

export function requireSequence(value: unknown, label = 'sequence'): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
  return value as number;
}

export function freezePersistenceRecord<T extends JsonObject>(value: T): T {
  assertJsonSafe(value);
  return freezeJsonValue(value);
}

export function assertCurrentRecordSchema(value: { readonly schemaVersion: number }, label: string): void {
  if (value.schemaVersion !== PERSISTENCE_SCHEMA_VERSION) throw new TypeError(`${label} schemaVersion must be ${PERSISTENCE_SCHEMA_VERSION}`);
}
