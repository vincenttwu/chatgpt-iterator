import type { JsonObject } from '../core/types.ts';
import type { QueueItemRecord, QueueRecord } from '../persistence/types.ts';

export const QUEUE_SCHEMA_VERSION = 1 as const;
export const QUEUE_RUNTIME_OPERATIONS = Object.freeze({
  list: 'queue.list',
  get: 'queue.get',
  references: 'queue.references',
  create: 'queue.create',
  update: 'queue.update',
  duplicate: 'queue.duplicate',
  delete: 'queue.delete',
  hydrate: 'queue.hydrate',
} as const);

export type QueueSnapshot = QueueRecord;
export type QueueItemSnapshot = QueueItemRecord;

export interface QueueItemWriteInput extends JsonObject {
  readonly id: string | null;
  readonly message: string | null;
  readonly templateId: string | null;
  readonly enabled: boolean;
  readonly delayAfterSeconds: number | null;
}

export interface QueueWriteInput extends JsonObject {
  readonly name: string;
  readonly items: QueueItemWriteInput[];
}

export interface QueueTemplateReference extends JsonObject {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly enabled: boolean;
}

export interface QueueReferenceCatalog extends JsonObject {
  readonly templates: QueueTemplateReference[];
}

export interface ResolvedQueueItem extends JsonObject {
  readonly id: string;
  readonly position: number;
  readonly source: 'literal' | 'template';
  readonly templateId: string | null;
  readonly templateRevision: number | null;
  readonly content: string;
  readonly delayAfterSeconds: number | null;
}

export interface QueueHydration extends JsonObject {
  readonly schemaVersion: 1;
  readonly queue: QueueRecord;
  readonly items: QueueItemRecord[];
  readonly resolvedItems: ResolvedQueueItem[];
}
