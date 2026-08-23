import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope } from '../core/index.ts';
import type { RequestEnvelope } from '../core/envelope.ts';
import type { DurableRunManager } from '../runs/manager.ts';
import { RUN_RUNTIME_OPERATIONS } from '../runs/types.ts';
import type { DurableRunSnapshot } from '../runs/types.ts';

export type RunManagerProvider = () => Promise<DurableRunManager>;
export interface RunExecutionController {
  activate(snapshot: DurableRunSnapshot): void;
  cancel(runId: string): Promise<void>;
}
export type RunExecutionProvider = () => Promise<RunExecutionController>;

function requireRequest(raw: unknown): RequestEnvelope {
  const message = requireMessageEnvelope(raw);
  if (message.kind !== 'request') throw new ContractError(ERROR_CODES.invalidMessage, 'run runtime accepts requests only');
  if (message.target !== 'background') throw new ContractError(ERROR_CODES.invalidMessage, 'run request target must be background');
  return message;
}

function requireRunId(payload: Record<string, unknown>): string {
  if (typeof payload.runId !== 'string') throw new ContractError(ERROR_CODES.invalidMessage, 'runId is required');
  return payload.runId;
}

export class RunRuntimeServer {
  readonly #manager: RunManagerProvider;
  readonly #execution: RunExecutionProvider | undefined;
  constructor(manager: RunManagerProvider, execution?: RunExecutionProvider) { this.#manager = manager; this.#execution = execution; }

  async handle(raw: unknown): Promise<unknown> {
    let request: RequestEnvelope | undefined;
    try {
      request = requireRequest(raw);
      if (request.source !== 'sidepanel') throw new ContractError(ERROR_CODES.invalidMessage, 'run commands must originate from sidepanel');
      const manager = await this.#manager();
      const payload = request.payload as Record<string, unknown>;
      switch (request.operation) {
        case RUN_RUNTIME_OPERATIONS.create: {
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'run.create must be a command');
          const result = await manager.create({
            runId: typeof payload.runId === 'string' ? payload.runId : request.requestId,
            targetTabId: payload.targetTabId,
            targetWindowId: payload.targetWindowId,
            commandId: request.requestId,
            messageTemplate: payload.messageTemplate,
            totalIterations: payload.totalIterations,
            delaySeconds: payload.delaySeconds,
            autoContinue: payload.autoContinue,
            autoScroll: payload.autoScroll,
          });
          return createSuccessResponse(request, { run: result.snapshot, idempotent: result.idempotent });
        }
        case RUN_RUNTIME_OPERATIONS.get: {
          if (request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'run.get must be a query');
          const run = await manager.get(requireRunId(payload));
          if (run === undefined) throw new ContractError(ERROR_CODES.unavailable, 'run not found');
          return createSuccessResponse(request, run);
        }
        case RUN_RUNTIME_OPERATIONS.list: {
          if (request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'run.list must be a query');
          return createSuccessResponse(request, await manager.list());
        }
        case RUN_RUNTIME_OPERATIONS.start:
        case RUN_RUNTIME_OPERATIONS.pause:
        case RUN_RUNTIME_OPERATIONS.resume:
        case RUN_RUNTIME_OPERATIONS.stop: {
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, `${request.operation} must be a command`);
          const runId = requireRunId(payload);
          const expectedGeneration = payload.expectedGeneration;
          const result = request.operation === RUN_RUNTIME_OPERATIONS.start
            ? await manager.start(runId, expectedGeneration, request.requestId)
            : request.operation === RUN_RUNTIME_OPERATIONS.pause
              ? await manager.pause(runId, expectedGeneration, request.requestId)
              : request.operation === RUN_RUNTIME_OPERATIONS.resume
                ? await manager.resume(runId, expectedGeneration, request.requestId)
                : await manager.stop(runId, expectedGeneration, request.requestId);
          if (this.#execution !== undefined) {
            const execution = await this.#execution();
            if (request.operation === RUN_RUNTIME_OPERATIONS.pause || request.operation === RUN_RUNTIME_OPERATIONS.stop) await execution.cancel(runId);
            else if (!result.idempotent) execution.activate(result.snapshot);
          }
          return createSuccessResponse(request, { run: result.snapshot, idempotent: result.idempotent });
        }
        default:
          throw new ContractError(ERROR_CODES.unsupportedOperation, `Unsupported run operation: ${request.operation}`);
      }
    } catch (error) {
      if (request !== undefined) return createFailureResponse(request, error);
      throw error;
    }
  }
}
