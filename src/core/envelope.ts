import { ContractError, ERROR_CATEGORIES, ERROR_CODES, normalizeError, type ErrorCode, type ErrorPayload } from './errors.ts';
import { createStableId, requireStableId, type StableId } from './ids.ts';
import { assertJsonSafe, cloneJsonValue, freezeJsonValue } from './json.ts';
import type { JsonObject, JsonValue, MessageIntent, RuntimeContext } from './types.ts';
import { CONTRACT_ERROR_SCHEMA_VERSION, MESSAGE_PROTOCOL_VERSION, MESSAGE_SCHEMA_VERSION } from './versions.ts';

const OPERATION_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/;
const CONTEXTS = new Set<RuntimeContext>(['sidepanel', 'background', 'content']);

export interface RequestEnvelope<P extends JsonObject = JsonObject> extends JsonObject {
  readonly kind: 'request';
  readonly schemaVersion: number;
  readonly protocolVersion: number;
  readonly messageId: StableId<'message'>;
  readonly requestId: StableId<'request'>;
  readonly requestSequence: number;
  readonly intent: MessageIntent;
  readonly source: RuntimeContext;
  readonly target: RuntimeContext;
  readonly operation: string;
  readonly payload: P;
}

export interface SuccessOutcome<R extends JsonValue = JsonValue> extends JsonObject {
  readonly ok: true;
  readonly value: R;
}
export interface FailureOutcome extends JsonObject {
  readonly ok: false;
  readonly error: ErrorPayload;
}
export type ResponseOutcome<R extends JsonValue = JsonValue> = SuccessOutcome<R> | FailureOutcome;

export interface ResponseEnvelope<R extends JsonValue = JsonValue> extends JsonObject {
  readonly kind: 'response';
  readonly schemaVersion: number;
  readonly protocolVersion: number;
  readonly messageId: StableId<'message'>;
  readonly requestId: StableId<'request'>;
  readonly requestSequence: number;
  readonly source: RuntimeContext;
  readonly target: RuntimeContext;
  readonly operation: string;
  readonly outcome: ResponseOutcome<R>;
}

export type MessageEnvelope = RequestEnvelope | ResponseEnvelope;


function requireOnlyKeys(candidate: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allow = new Set(allowed);
  for (const key of Object.keys(candidate)) {
    if (!allow.has(key)) throw new ContractError(ERROR_CODES.invalidMessage, `unknown field at ${path}: ${key}`);
  }
}

function requireErrorPayload(value: unknown): ErrorPayload {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ContractError(ERROR_CODES.invalidMessage, 'error payload must be an object');
  }
  const candidate = value as Record<string, unknown>;
  requireOnlyKeys(candidate, ['schemaVersion', 'category', 'code', 'message', 'details'], '$.outcome.error');
  if (candidate.schemaVersion !== CONTRACT_ERROR_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported error schema');
  if (!ERROR_CATEGORIES.includes(candidate.category as never)) throw new ContractError(ERROR_CODES.invalidMessage, 'unknown error category');
  const validCodes = new Set<string>(Object.values(ERROR_CODES));
  if (typeof candidate.code !== 'string' || !validCodes.has(candidate.code)) throw new ContractError(ERROR_CODES.invalidMessage, 'unknown error code');
  if (typeof candidate.message !== 'string' || candidate.message.length === 0 || candidate.message.length > 512) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid error message');
  if (candidate.details !== undefined) {
    if (candidate.details === null || Array.isArray(candidate.details) || typeof candidate.details !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'error details must be an object');
    assertJsonSafe(candidate.details);
  }
  return freezeJsonValue({
    schemaVersion: CONTRACT_ERROR_SCHEMA_VERSION,
    category: candidate.category as ErrorPayload['category'],
    code: candidate.code as ErrorCode,
    message: candidate.message,
    ...(candidate.details === undefined ? {} : { details: cloneJsonValue(candidate.details as JsonObject) }),
  });
}

function requireSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'requestSequence must be a positive safe integer');
  }
  return value as number;
}

function requireContext(value: unknown, field: string): RuntimeContext {
  if (typeof value !== 'string' || !CONTEXTS.has(value as RuntimeContext)) {
    throw new ContractError(ERROR_CODES.invalidMessage, `${field} must be a known runtime context`);
  }
  return value as RuntimeContext;
}

function requireOperation(value: unknown): string {
  if (typeof value !== 'string' || !OPERATION_PATTERN.test(value)) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'operation must be dot-separated lowercase identifiers');
  }
  return value;
}

function requireIntent(value: unknown): MessageIntent {
  if (value !== 'query' && value !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'intent must be query or command');
  return value;
}

function requireVersions(candidate: Record<string, unknown>): void {
  if (candidate.protocolVersion !== MESSAGE_PROTOCOL_VERSION) {
    throw new ContractError(ERROR_CODES.unsupportedProtocol, `Unsupported protocolVersion: ${String(candidate.protocolVersion)}`);
  }
  if (candidate.schemaVersion !== MESSAGE_SCHEMA_VERSION) {
    throw new ContractError(ERROR_CODES.unsupportedSchema, `Unsupported schemaVersion: ${String(candidate.schemaVersion)}`);
  }
}

export function createRequest<P extends JsonObject>(input: {
  readonly requestSequence: number;
  readonly intent: MessageIntent;
  readonly source: RuntimeContext;
  readonly target: RuntimeContext;
  readonly operation: string;
  readonly payload: P;
}): RequestEnvelope<P> {
  const payload = cloneJsonValue(input.payload);
  return freezeJsonValue({
    kind: 'request',
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    messageId: createStableId('message'),
    requestId: createStableId('request'),
    requestSequence: requireSequence(input.requestSequence),
    intent: requireIntent(input.intent),
    source: requireContext(input.source, 'source'),
    target: requireContext(input.target, 'target'),
    operation: requireOperation(input.operation),
    payload,
  });
}

export function createSuccessResponse<R extends JsonValue>(request: RequestEnvelope, value: R): ResponseEnvelope<R> {
  const cloned = cloneJsonValue(value);
  return freezeJsonValue({
    kind: 'response',
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    messageId: createStableId('message'),
    requestId: request.requestId,
    requestSequence: request.requestSequence,
    source: request.target,
    target: request.source,
    operation: request.operation,
    outcome: { ok: true, value: cloned },
  });
}

export function createFailureResponse(request: RequestEnvelope, error: unknown): ResponseEnvelope {
  return freezeJsonValue({
    kind: 'response',
    schemaVersion: MESSAGE_SCHEMA_VERSION,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    messageId: createStableId('message'),
    requestId: request.requestId,
    requestSequence: request.requestSequence,
    source: request.target,
    target: request.source,
    operation: request.operation,
    outcome: { ok: false, error: normalizeError(error).toPayload() },
  });
}

export function requireMessageEnvelope(value: unknown): MessageEnvelope {
  try {
    assertJsonSafe(value);
  } catch (error) {
    throw new ContractError(ERROR_CODES.invalidMessage, error instanceof Error ? error.message : 'message is not JSON-safe');
  }
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ContractError(ERROR_CODES.invalidMessage, 'message envelope must be an object');
  }
  const candidate = value as Record<string, unknown>;
  requireOnlyKeys(candidate, ['kind', 'schemaVersion', 'protocolVersion', 'messageId', 'requestId', 'requestSequence', 'intent', 'source', 'target', 'operation', 'payload', 'outcome'], '$');
  requireVersions(candidate);
  const messageId = requireStableId(candidate.messageId, 'message');
  const requestId = requireStableId(candidate.requestId, 'request');
  const requestSequence = requireSequence(candidate.requestSequence);
  const source = requireContext(candidate.source, 'source');
  const target = requireContext(candidate.target, 'target');
  const operation = requireOperation(candidate.operation);

  if (candidate.kind === 'request') {
    if (candidate.outcome !== undefined) throw new ContractError(ERROR_CODES.invalidMessage, 'request must not contain response-only fields');
    const intent = requireIntent(candidate.intent);
    if (candidate.payload === null || Array.isArray(candidate.payload) || typeof candidate.payload !== 'object') {
      throw new ContractError(ERROR_CODES.invalidMessage, 'request payload must be a JSON object');
    }
    return freezeJsonValue({
      kind: 'request', schemaVersion: MESSAGE_SCHEMA_VERSION, protocolVersion: MESSAGE_PROTOCOL_VERSION,
      messageId, requestId, requestSequence, intent, source, target, operation,
      payload: cloneJsonValue(candidate.payload as JsonObject),
    });
  }

  if (candidate.kind === 'response') {
    if (candidate.intent !== undefined || candidate.payload !== undefined) throw new ContractError(ERROR_CODES.invalidMessage, 'response must not contain request-only fields');
    const outcome = candidate.outcome;
    if (outcome === null || Array.isArray(outcome) || typeof outcome !== 'object') {
      throw new ContractError(ERROR_CODES.invalidMessage, 'response outcome must be an object');
    }
    const raw = outcome as Record<string, unknown>;
    if (raw.ok === true) {
      assertJsonSafe(raw.value);
      return freezeJsonValue({
        kind: 'response', schemaVersion: MESSAGE_SCHEMA_VERSION, protocolVersion: MESSAGE_PROTOCOL_VERSION,
        messageId, requestId, requestSequence, source, target, operation,
        outcome: { ok: true, value: cloneJsonValue(raw.value as JsonValue) },
      });
    }
    if (raw.ok === false) {
      const error = requireErrorPayload(raw.error);
      return freezeJsonValue({
        kind: 'response', schemaVersion: MESSAGE_SCHEMA_VERSION, protocolVersion: MESSAGE_PROTOCOL_VERSION,
        messageId, requestId, requestSequence, source, target, operation,
        outcome: { ok: false, error },
      });
    }
  }

  throw new ContractError(ERROR_CODES.invalidMessage, 'unknown message kind or response outcome');
}
