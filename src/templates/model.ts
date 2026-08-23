import { ContractError, ERROR_CODES } from '../core/index.ts';
import { MESSAGE_TEMPLATE_TOKENS, renderMessageTemplate, validateMessageTemplate } from '../messages/template.ts';
import type { MessageContext } from '../messages/types.ts';
import type { TemplateRecord } from '../persistence/types.ts';
import { requireEntityId, requireRevision } from '../persistence/types.ts';
import { TEMPLATE_SCHEMA_VERSION, type TemplateWriteInput } from './types.ts';

export const TEMPLATE_NAME_MAX = 120 as const;
export const TEMPLATE_BODY_MAX = 65_536 as const;
export const TEMPLATE_VARIABLES = MESSAGE_TEMPLATE_TOKENS;

export function requireTemplateName(value: unknown): string {
  if (typeof value !== 'string') throw new ContractError(ERROR_CODES.invalidMessage, 'template name must be a string');
  const name = value.trim();
  if (name.length < 1 || name.length > TEMPLATE_NAME_MAX) {
    throw new ContractError(ERROR_CODES.invalidMessage, `template name must be 1..${TEMPLATE_NAME_MAX} characters`);
  }
  return name;
}

export function requireTemplateBody(value: unknown): string {
  if (typeof value !== 'string') throw new ContractError(ERROR_CODES.invalidMessage, 'template body must be a string');
  validateMessageTemplate(value);
  return value;
}

export function requireTemplateEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ContractError(ERROR_CODES.invalidMessage, 'template enabled must be boolean');
  return value;
}

export function requireTemplateWriteInput(value: unknown): TemplateWriteInput {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ContractError(ERROR_CODES.invalidMessage, 'template input must be an object');
  }
  const candidate = value as Record<string, unknown>;
  return {
    name: requireTemplateName(candidate.name),
    body: requireTemplateBody(candidate.body),
    enabled: requireTemplateEnabled(candidate.enabled),
  };
}

export function createTemplateRecord(input: TemplateWriteInput, id: string, now: string): TemplateRecord {
  requireEntityId(id, 'template id');
  return Object.freeze({
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id,
    revision: 1,
    name: requireTemplateName(input.name),
    body: requireTemplateBody(input.body),
    enabled: requireTemplateEnabled(input.enabled),
    createdAt: now,
    updatedAt: now,
  });
}

export function updateTemplateRecord(current: TemplateRecord, input: TemplateWriteInput, now: string): TemplateRecord {
  requireRevision(current.revision, 'template revision');
  return Object.freeze({
    ...current,
    revision: current.revision + 1,
    name: requireTemplateName(input.name),
    body: requireTemplateBody(input.body),
    enabled: requireTemplateEnabled(input.enabled),
    updatedAt: now,
  });
}

export function previewTemplate(body: string, context: MessageContext): string {
  return renderMessageTemplate(requireTemplateBody(body), context);
}
