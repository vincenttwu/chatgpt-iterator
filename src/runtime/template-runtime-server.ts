import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope, type RequestEnvelope } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import type { TemplateService } from '../templates/service.ts';
import { TEMPLATE_RUNTIME_OPERATIONS } from '../templates/types.ts';

export type TemplateServiceProvider = () => Promise<TemplateService>;

function requireRequest(raw: unknown): RequestEnvelope {
  const message = requireMessageEnvelope(raw);
  if (message.kind !== 'request') throw new ContractError(ERROR_CODES.invalidMessage, 'template runtime accepts requests only');
  if (message.target !== 'background' || message.source !== 'sidepanel') {
    throw new ContractError(ERROR_CODES.invalidMessage, 'template requests must originate from sidepanel and target background');
  }
  return message;
}

function requireOnly(payload: JsonObject, allowed: readonly string[]): void {
  const extras = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new ContractError(ERROR_CODES.invalidMessage, `unexpected template payload field: ${extras[0]}`);
}

function requireString(payload: JsonObject, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string') throw new ContractError(ERROR_CODES.invalidMessage, `${key} is required`);
  return value;
}

export class TemplateRuntimeServer {
  readonly #service: TemplateServiceProvider;
  readonly #onChanged: (() => void) | undefined;

  constructor(service: TemplateServiceProvider, onChanged?: () => void) {
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
        case TEMPLATE_RUNTIME_OPERATIONS.list:
          if (request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'template.list must be a query');
          requireOnly(payload, []);
          return createSuccessResponse(request, await service.list());
        case TEMPLATE_RUNTIME_OPERATIONS.get:
          if (request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'template.get must be a query');
          requireOnly(payload, ['templateId']);
          return createSuccessResponse(request, await service.get(requireString(payload, 'templateId')) ?? null);
        case TEMPLATE_RUNTIME_OPERATIONS.create: {
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'template.create must be a command');
          requireOnly(payload, ['name', 'body', 'enabled']);
          const created = await service.create(request.requestId, payload);
          this.#onChanged?.();
          return createSuccessResponse(request, created);
        }
        case TEMPLATE_RUNTIME_OPERATIONS.update: {
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'template.update must be a command');
          requireOnly(payload, ['templateId', 'expectedRevision', 'name', 'body', 'enabled']);
          const updated = await service.update(requireString(payload, 'templateId'), payload.expectedRevision, payload);
          this.#onChanged?.();
          return createSuccessResponse(request, updated);
        }
        case TEMPLATE_RUNTIME_OPERATIONS.duplicate: {
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'template.duplicate must be a command');
          requireOnly(payload, ['templateId', 'expectedRevision', 'name']);
          const duplicated = await service.duplicate(requireString(payload, 'templateId'), payload.expectedRevision, request.requestId, payload.name);
          this.#onChanged?.();
          return createSuccessResponse(request, duplicated);
        }
        case TEMPLATE_RUNTIME_OPERATIONS.delete:
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'template.delete must be a command');
          requireOnly(payload, ['templateId', 'expectedRevision']);
          await service.delete(requireString(payload, 'templateId'), payload.expectedRevision);
          this.#onChanged?.();
          return createSuccessResponse(request, { deleted: true });
        default:
          throw new ContractError(ERROR_CODES.unsupportedOperation, `Unsupported template operation: ${request.operation}`);
      }
    } catch (error) {
      if (request !== undefined) return createFailureResponse(request, error);
      throw error;
    }
  }
}
