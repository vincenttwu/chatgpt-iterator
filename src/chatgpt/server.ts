import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope, type RequestEnvelope, type ResponseEnvelope } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import { CHATGPT_ADAPTER_ERROR_CODES, ChatGptAdapterError, degradationCodeForAdapterError } from './errors.ts';
import { CHATGPT_ADAPTER_OPERATIONS } from './types.ts';
import type { ChatGptAdapterSnapshot } from './types.ts';
import { requireConversationContext } from './conversation.ts';
import type { ChatGptAdapter } from './adapter.ts';
import { assistantFingerprintFromLegacySignature, isAssistantFingerprint } from './fingerprint.ts';

function requireEmptyPayload(payload: JsonObject): void {
  if (Object.keys(payload).length !== 0) throw new ContractError(ERROR_CODES.invalidMessage, 'operation payload must be empty');
}

function requireSendPayload(payload: JsonObject): { message: string; expectedAssistantBaselineFingerprint?: string; expectedConversation?: ReturnType<typeof requireConversationContext> } {
  const keys = Object.keys(payload);
  if (!keys.every((key) => key === 'message' || key === 'expectedAssistantBaselineFingerprint' || key === 'expectedAssistantBaselineSignature' || key === 'expectedConversation') || typeof payload.message !== 'string') {
    throw new ContractError(ERROR_CODES.invalidMessage, 'chatgpt.send payload must contain message and optional expected assistant baseline');
  }
  if (payload.expectedAssistantBaselineFingerprint !== undefined && payload.expectedAssistantBaselineSignature !== undefined) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'chatgpt.send baseline must use one compatibility field only');
  }
  const message = payload.message;
  if (message.trim().length === 0 || message.length > 65_536) throw new ContractError(ERROR_CODES.invalidMessage, 'message must be 1..65536 characters');
  const expectedConversation = payload.expectedConversation === undefined ? undefined : requireConversationContext(payload.expectedConversation);
  const fingerprint = payload.expectedAssistantBaselineFingerprint;
  if (fingerprint !== undefined) {
    if (!isAssistantFingerprint(fingerprint)) throw new ContractError(ERROR_CODES.invalidMessage, 'expectedAssistantBaselineFingerprint must be an opaque adapter v2 fingerprint');
    return { message, expectedAssistantBaselineFingerprint: fingerprint, ...(expectedConversation === undefined ? {} : { expectedConversation }) };
  }
  const legacy = payload.expectedAssistantBaselineSignature;
  if (legacy !== undefined) {
    if (typeof legacy !== 'string' || legacy.length > 4_096) throw new ContractError(ERROR_CODES.invalidMessage, 'legacy assistant baseline must be a bounded string');
    return { message, expectedAssistantBaselineFingerprint: assistantFingerprintFromLegacySignature(legacy), ...(expectedConversation === undefined ? {} : { expectedConversation }) };
  }
  return { message, ...(expectedConversation === undefined ? {} : { expectedConversation }) };
}

function normalizeAdapterError(error: unknown): ContractError {
  if (error instanceof ContractError) return error;
  if (error instanceof ChatGptAdapterError) {
    const stale = error.code === CHATGPT_ADAPTER_ERROR_CODES.draftNotEmpty || error.code === CHATGPT_ADAPTER_ERROR_CODES.responseBaselineChanged || error.code === CHATGPT_ADAPTER_ERROR_CODES.conversationChanged;
    const code = stale ? ERROR_CODES.staleRequest : ERROR_CODES.unavailable;
    const reasonCode = degradationCodeForAdapterError(error.code);
    return new ContractError(code, error.message, { adapterCode: error.code, ...(reasonCode === null ? {} : { reasonCode }) });
  }
  return new ContractError(ERROR_CODES.internal, error instanceof Error ? error.message : 'ChatGPT adapter failure');
}

export class ChatGptAdapterServer {
  readonly #adapter: ChatGptAdapter;
  readonly #latestSnapshot: () => ChatGptAdapterSnapshot;

  constructor(adapter: ChatGptAdapter, latestSnapshot: () => ChatGptAdapterSnapshot = () => adapter.snapshot()) {
    this.#adapter = adapter;
    this.#latestSnapshot = latestSnapshot;
  }

  async handle(raw: unknown): Promise<ResponseEnvelope> {
    let request: RequestEnvelope | undefined;
    try {
      const message = requireMessageEnvelope(raw);
      if (message.kind !== 'request') throw new ContractError(ERROR_CODES.invalidMessage, 'content adapter accepts request envelopes only');
      request = message;
      if (request.target !== 'content') throw new ContractError(ERROR_CODES.invalidMessage, 'content adapter request target must be content');

      switch (request.operation) {
        case CHATGPT_ADAPTER_OPERATIONS.snapshot:
          requireEmptyPayload(request.payload);
          return createSuccessResponse(request, this.#latestSnapshot());
        case CHATGPT_ADAPTER_OPERATIONS.diagnostics:
          requireEmptyPayload(request.payload);
          return createSuccessResponse(request, this.#adapter.diagnostics());
        case CHATGPT_ADAPTER_OPERATIONS.send: {
          const input = requireSendPayload(request.payload);
          return createSuccessResponse(request, await this.#adapter.send(input.message, 5_000, input.expectedAssistantBaselineFingerprint, input.expectedConversation));
        }
        case CHATGPT_ADAPTER_OPERATIONS.continueResponse:
          requireEmptyPayload(request.payload);
          return createSuccessResponse(request, this.#adapter.continueResponse());
        case CHATGPT_ADAPTER_OPERATIONS.stopResponse:
          requireEmptyPayload(request.payload);
          return createSuccessResponse(request, this.#adapter.stopResponse());
        case CHATGPT_ADAPTER_OPERATIONS.scrollToBottom:
          requireEmptyPayload(request.payload);
          this.#adapter.scrollToBottom();
          return createSuccessResponse(request, { scrolled: true });
        default:
          throw new ContractError(ERROR_CODES.unsupportedOperation, `Unsupported content operation: ${request.operation}`);
      }
    } catch (error) {
      if (request === undefined) throw normalizeAdapterError(error);
      return createFailureResponse(request, normalizeAdapterError(error));
    }
  }
}
