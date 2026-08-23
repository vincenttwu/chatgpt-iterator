import type { JsonObject } from '../core/types.ts';
import type { TemplateRecord } from '../persistence/types.ts';

export const TEMPLATE_SCHEMA_VERSION = 1 as const;
export const TEMPLATE_RUNTIME_OPERATIONS = Object.freeze({
  list: 'template.list',
  get: 'template.get',
  create: 'template.create',
  update: 'template.update',
  duplicate: 'template.duplicate',
  delete: 'template.delete',
} as const);

export type TemplateSnapshot = TemplateRecord;

export interface TemplateWriteInput extends JsonObject {
  readonly name: string;
  readonly body: string;
  readonly enabled: boolean;
}

export interface TemplatePreviewContext extends JsonObject {
  readonly iteration: number;
  readonly total: number;
  readonly remaining: number;
  readonly timestamp: string;
}
