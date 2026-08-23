import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope, type RequestEnvelope } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import type { PresetService } from '../presets/service.ts';
import { PRESET_RUNTIME_OPERATIONS } from '../presets/types.ts';

export type PresetServiceProvider = () => Promise<PresetService>;

function requireRequest(raw: unknown): RequestEnvelope {
  const message = requireMessageEnvelope(raw);
  if (message.kind !== 'request') throw new ContractError(ERROR_CODES.invalidMessage, 'preset runtime accepts requests only');
  if (message.target !== 'background' || message.source !== 'sidepanel') {
    throw new ContractError(ERROR_CODES.invalidMessage, 'preset requests must originate from sidepanel and target background');
  }
  return message;
}

function requireOnly(payload: JsonObject, allowed: readonly string[]): void {
  const extras = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new ContractError(ERROR_CODES.invalidMessage, `unexpected preset payload field: ${extras[0]}`);
}

function requireString(payload: JsonObject, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string') throw new ContractError(ERROR_CODES.invalidMessage, `${key} is required`);
  return value;
}

export class PresetRuntimeServer {
  readonly #service: PresetServiceProvider;
  readonly #onChanged: (() => void) | undefined;

  constructor(service: PresetServiceProvider, onChanged?: () => void) {
    this.#service = service;
    this.#onChanged = onChanged;
  }

  async handle(raw: unknown): Promise<unknown> {
    let request: RequestEnvelope | undefined;
    try {
      request = requireRequest(raw);
      const payload = request.payload;
      const service = await this.#service();
      switch (request.operation) {
        case PRESET_RUNTIME_OPERATIONS.list:
          if (request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'preset.list must be a query');
          requireOnly(payload, []);
          return createSuccessResponse(request, await service.list());
        case PRESET_RUNTIME_OPERATIONS.get:
          if (request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'preset.get must be a query');
          requireOnly(payload, ['presetId']);
          return createSuccessResponse(request, await service.get(requireString(payload, 'presetId')) ?? null);
        case PRESET_RUNTIME_OPERATIONS.references:
          if (request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'preset.references must be a query');
          requireOnly(payload, []);
          return createSuccessResponse(request, await service.references());
        case PRESET_RUNTIME_OPERATIONS.hydrate:
          if (request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'preset.hydrate must be a query');
          requireOnly(payload, ['presetId']);
          return createSuccessResponse(request, await service.hydrate(requireString(payload, 'presetId')));
        case PRESET_RUNTIME_OPERATIONS.create: {
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'preset.create must be a command');
          requireOnly(payload, ['name', 'mode', 'templateId', 'queueId', 'iterationCount', 'delaySeconds', 'autoContinue', 'autoScroll', 'preventDiscard']);
          const created = await service.create(request.requestId, payload);
          this.#onChanged?.();
          return createSuccessResponse(request, created);
        }
        case PRESET_RUNTIME_OPERATIONS.update: {
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'preset.update must be a command');
          requireOnly(payload, ['presetId', 'expectedRevision', 'name', 'mode', 'templateId', 'queueId', 'iterationCount', 'delaySeconds', 'autoContinue', 'autoScroll', 'preventDiscard']);
          const updated = await service.update(requireString(payload, 'presetId'), payload.expectedRevision, payload);
          this.#onChanged?.();
          return createSuccessResponse(request, updated);
        }
        case PRESET_RUNTIME_OPERATIONS.duplicate: {
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'preset.duplicate must be a command');
          requireOnly(payload, ['presetId', 'expectedRevision', 'name']);
          const duplicated = await service.duplicate(requireString(payload, 'presetId'), payload.expectedRevision, request.requestId, payload.name);
          this.#onChanged?.();
          return createSuccessResponse(request, duplicated);
        }
        case PRESET_RUNTIME_OPERATIONS.delete:
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'preset.delete must be a command');
          requireOnly(payload, ['presetId', 'expectedRevision']);
          await service.delete(requireString(payload, 'presetId'), payload.expectedRevision);
          this.#onChanged?.();
          return createSuccessResponse(request, { deleted: true });
        default:
          throw new ContractError(ERROR_CODES.unsupportedOperation, `Unsupported preset operation: ${request.operation}`);
      }
    } catch (error) {
      if (request !== undefined) return createFailureResponse(request, error);
      throw error;
    }
  }
}
