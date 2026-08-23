import { ContractError, ERROR_CODES } from '../core/index.ts';
import { validateMessageTemplate } from '../messages/template.ts';
import type { QueueItemRecord, QueueRecord } from '../persistence/types.ts';
import { requireEntityId, requireRevision } from '../persistence/types.ts';
import { QUEUE_SCHEMA_VERSION, type QueueItemWriteInput, type QueueWriteInput } from './types.ts';

export const QUEUE_NAME_MAX = 120 as const;
export const QUEUE_MESSAGE_MAX = 65_536 as const;
export const QUEUE_ITEM_MAX = 1_000 as const;
export const QUEUE_DELAY_MIN = 5 as const;
export const QUEUE_DELAY_MAX = 3_600 as const;

export function requireQueueName(value: unknown): string {
  if (typeof value !== 'string') throw new ContractError(ERROR_CODES.invalidMessage, 'queue name must be a string');
  const name = value.trim();
  if (name.length < 1 || name.length > QUEUE_NAME_MAX) throw new ContractError(ERROR_CODES.invalidMessage, `queue name must be 1..${QUEUE_NAME_MAX} characters`);
  return name;
}

function requireMessage(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > QUEUE_MESSAGE_MAX) throw new ContractError(ERROR_CODES.invalidMessage, `queue literal message must be 1..${QUEUE_MESSAGE_MAX} characters`);
  validateMessageTemplate(value);
  return value;
}

function requireOptionalId(value: unknown): string | null {
  return value === null ? null : requireEntityId(value, 'queue item reference id');
}

function requireDelay(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < QUEUE_DELAY_MIN || (value as number) > QUEUE_DELAY_MAX) {
    throw new ContractError(ERROR_CODES.invalidMessage, `delayAfterSeconds must be null or an integer from ${QUEUE_DELAY_MIN} to ${QUEUE_DELAY_MAX}`);
  }
  return value as number;
}

export function requireQueueItemWriteInput(value: unknown): QueueItemWriteInput {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'queue item must be an object');
  const raw = value as Record<string, unknown>;
  const id = raw.id === null ? null : requireEntityId(raw.id, 'queue item id');
  const message = requireMessage(raw.message);
  const templateId = requireOptionalId(raw.templateId);
  if ((message === null) === (templateId === null)) throw new ContractError(ERROR_CODES.invalidMessage, 'queue item requires exactly one of message or templateId');
  if (typeof raw.enabled !== 'boolean') throw new ContractError(ERROR_CODES.invalidMessage, 'queue item enabled must be boolean');
  return { id, message, templateId, enabled: raw.enabled, delayAfterSeconds: requireDelay(raw.delayAfterSeconds) };
}

export function requireQueueWriteInput(value: unknown): QueueWriteInput {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'queue input must be an object');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.items) || raw.items.length > QUEUE_ITEM_MAX) throw new ContractError(ERROR_CODES.invalidMessage, `queue items must be an array with at most ${QUEUE_ITEM_MAX} items`);
  const items = raw.items.map(requireQueueItemWriteInput);
  const ids = items.flatMap((item) => item.id === null ? [] : [item.id]);
  if (new Set(ids).size !== ids.length) throw new ContractError(ERROR_CODES.invalidMessage, 'queue item IDs must be unique');
  if (items.filter((item) => item.enabled).length < 1) throw new ContractError(ERROR_CODES.invalidMessage, 'queue requires at least one enabled item');
  return { name: requireQueueName(raw.name), items };
}

export function createQueueRecord(name: string, id: string, now: string): QueueRecord {
  return Object.freeze({ schemaVersion: QUEUE_SCHEMA_VERSION, id: requireEntityId(id, 'queue id'), revision: 1, name: requireQueueName(name), createdAt: now, updatedAt: now });
}

export function updateQueueRecord(current: QueueRecord, name: string, now: string): QueueRecord {
  requireRevision(current.revision, 'queue revision');
  return Object.freeze({ ...current, revision: current.revision + 1, name: requireQueueName(name), updatedAt: now });
}

export function createQueueItemRecord(input: QueueItemWriteInput, id: string, queueId: string, position: number, now: string, createdAt = now): QueueItemRecord {
  const valid = requireQueueItemWriteInput({ ...input, id });
  return Object.freeze({
    schemaVersion: QUEUE_SCHEMA_VERSION,
    id: requireEntityId(id, 'queue item id'),
    queueId: requireEntityId(queueId, 'queue id'),
    position,
    message: valid.message,
    templateId: valid.templateId,
    enabled: valid.enabled,
    delayAfterSeconds: valid.delayAfterSeconds,
    createdAt,
    updatedAt: now,
  });
}
