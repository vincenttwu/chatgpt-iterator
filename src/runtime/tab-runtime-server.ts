import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope, type RequestEnvelope, type ResponseEnvelope } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import { requireChatGptAdapterSnapshot, type ChatGptAdapterSnapshot } from '../chatgpt/index.ts';
import type { ChatGptTabRegistry } from '../tabs/registry.ts';
import { TAB_RUNTIME_OPERATIONS } from '../tabs/types.ts';

import type { RuntimeMessageSenderLike } from './caller-context.ts';

export type AdapterStateListener = (tabId: number, windowId: number, snapshot: ChatGptAdapterSnapshot) => void;

function requireEmpty(payload: JsonObject): void {
  if (Object.keys(payload).length !== 0) throw new ContractError(ERROR_CODES.invalidMessage, 'operation payload must be empty');
}

function requireTabId(payload: JsonObject): number {
  if (Object.keys(payload).length !== 1 || !Number.isSafeInteger(payload.tabId) || (payload.tabId as number) < 0) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'tabs.bind payload must contain only a non-negative tabId');
  }
  return payload.tabId as number;
}

function requireAdapterState(payload: JsonObject): unknown {
  if (Object.keys(payload).length !== 1 || payload.snapshot === undefined) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'tabs.adapterstate payload must contain only snapshot');
  }
  return payload.snapshot;
}

export class TabRuntimeServer {
  readonly #registry: ChatGptTabRegistry;
  readonly #adapterStateListener: AdapterStateListener | undefined;
  constructor(registry: ChatGptTabRegistry, adapterStateListener?: AdapterStateListener) {
    this.#registry = registry;
    this.#adapterStateListener = adapterStateListener;
  }

  async handle(raw: unknown, sender: RuntimeMessageSenderLike = {}): Promise<ResponseEnvelope> {
    let request: RequestEnvelope | undefined;
    try {
      const envelope = requireMessageEnvelope(raw);
      if (envelope.kind !== 'request' || envelope.target !== 'background') {
        throw new ContractError(ERROR_CODES.invalidMessage, 'tab runtime accepts background-targeted request envelopes only');
      }
      request = envelope;
      switch (request.operation) {
        case TAB_RUNTIME_OPERATIONS.refresh:
          if (request.source !== 'sidepanel' || request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'tabs.refresh requires sidepanel query');
          requireEmpty(request.payload);
          return createSuccessResponse(request, await this.#registry.refresh());
        case TAB_RUNTIME_OPERATIONS.bind:
          if (request.source !== 'sidepanel' || request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'tabs.bind requires sidepanel command');
          return createSuccessResponse(request, await this.#registry.bind(requireTabId(request.payload)));
        case TAB_RUNTIME_OPERATIONS.unbind:
          if (request.source !== 'sidepanel' || request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'tabs.unbind requires sidepanel command');
          requireEmpty(request.payload);
          return createSuccessResponse(request, this.#registry.unbind());
        case TAB_RUNTIME_OPERATIONS.adapterState: {
          if (request.source !== 'content' || request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'tabs.adapterstate requires content command');
          const tabId = sender.tab?.id;
          const windowId = sender.tab?.windowId;
          if (tabId === undefined || windowId === undefined) throw new ContractError(ERROR_CODES.invalidMessage, 'content adapter state requires sender tab identity');
          const snapshot = requireChatGptAdapterSnapshot(requireAdapterState(request.payload));
          const result = await this.#registry.noteAdapterState(tabId, windowId, snapshot);
          this.#adapterStateListener?.(tabId, windowId, snapshot);
          return createSuccessResponse(request, result);
        }
        default:
          throw new ContractError(ERROR_CODES.unsupportedOperation, `Unsupported tab operation: ${request.operation}`);
      }
    } catch (error) {
      if (request !== undefined) return createFailureResponse(request, error);
      throw error;
    }
  }
}
