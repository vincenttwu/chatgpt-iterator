import { assertJsonSafe, cloneJsonValue, freezeJsonValue } from './json.ts';
import type { JsonObject } from './types.ts';
import { CONTRACT_ERROR_SCHEMA_VERSION } from './versions.ts';

export const ERROR_CATEGORIES = ['validation', 'protocol', 'conflict', 'unavailable', 'internal'] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const ERROR_CODES = Object.freeze({
  invalidMessage: 'invalid_message',
  unsupportedProtocol: 'unsupported_protocol',
  unsupportedSchema: 'unsupported_schema',
  unsupportedOperation: 'unsupported_operation',
  staleRequest: 'stale_request',
  unavailable: 'unavailable',
  internal: 'internal',
} as const);
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const CATEGORY_BY_CODE: Readonly<Record<ErrorCode, ErrorCategory>> = Object.freeze({
  invalid_message: 'validation',
  unsupported_protocol: 'protocol',
  unsupported_schema: 'protocol',
  unsupported_operation: 'protocol',
  stale_request: 'conflict',
  unavailable: 'unavailable',
  internal: 'internal',
});

export interface ErrorPayload extends JsonObject {
  readonly schemaVersion: number;
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: JsonObject;
}

export class ContractError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly details: JsonObject | undefined;

  constructor(code: ErrorCode, message: string, details?: JsonObject) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.category = CATEGORY_BY_CODE[code];
    if (details !== undefined) {
      assertJsonSafe(details);
      this.details = freezeJsonValue(cloneJsonValue(details));
    }
  }

  toPayload(): ErrorPayload {
    return freezeJsonValue({
      schemaVersion: CONTRACT_ERROR_SCHEMA_VERSION,
      category: this.category,
      code: this.code,
      message: this.message.slice(0, 512),
      ...(this.details === undefined ? {} : { details: cloneJsonValue(this.details) }),
    });
  }
}

export function normalizeError(error: unknown): ContractError {
  if (error instanceof ContractError) return error;
  if (error instanceof Error) return new ContractError(ERROR_CODES.internal, error.message || 'Internal error');
  return new ContractError(ERROR_CODES.internal, 'Internal error');
}
