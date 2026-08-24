import { ContractError, ERROR_CODES, createRequest, requireMessageEnvelope } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import type { TabBrowserLike } from '../tabs/browser.ts';
import { CHATGPT_ADAPTER_OPERATIONS, requireChatGptAdapterSnapshot, type ChatGptAdapterDiagnostics, type ChatGptAdapterSnapshot, type ChatGptClickResult, type ChatGptConversationContext, type ChatGptSendResult } from '../chatgpt/index.ts';

function requireSuccessfulValue(raw: unknown): unknown {
  const response = requireMessageEnvelope(raw);
  if (response.kind !== 'response') throw new ContractError(ERROR_CODES.invalidMessage, 'content command returned non-response envelope');
  if (!response.outcome.ok) throw new ContractError(response.outcome.error.code, response.outcome.error.message, response.outcome.error.details);
  return response.outcome.value;
}

export class ChatGptRunClient {
  readonly #browser: Pick<TabBrowserLike, 'sendMessage'>;
  #requestSequence = 0;
  constructor(browser: Pick<TabBrowserLike, 'sendMessage'>) { this.#browser = browser; }

  async snapshot(tabId: number): Promise<ChatGptAdapterSnapshot> {
    return requireChatGptAdapterSnapshot(await this.#request(tabId, 'query', CHATGPT_ADAPTER_OPERATIONS.snapshot, {}));
  }

  async diagnostics(tabId: number): Promise<ChatGptAdapterDiagnostics> {
    return await this.#request(tabId, 'query', CHATGPT_ADAPTER_OPERATIONS.diagnostics, {}) as ChatGptAdapterDiagnostics;
  }

  async send(tabId: number, message: string, expectedAssistantBaselineFingerprint: string, expectedConversation?: ChatGptConversationContext): Promise<ChatGptSendResult> {
    return await this.#request(tabId, 'command', CHATGPT_ADAPTER_OPERATIONS.send, { message, expectedAssistantBaselineFingerprint, ...(expectedConversation === undefined ? {} : { expectedConversation }) }) as ChatGptSendResult;
  }

  async continueResponse(tabId: number): Promise<ChatGptClickResult> {
    return await this.#request(tabId, 'command', CHATGPT_ADAPTER_OPERATIONS.continueResponse, {}) as ChatGptClickResult;
  }

  async scrollToBottom(tabId: number): Promise<void> {
    await this.#request(tabId, 'command', CHATGPT_ADAPTER_OPERATIONS.scrollToBottom, {});
  }

  async #request(tabId: number, intent: 'query' | 'command', operation: string, payload: JsonObject): Promise<unknown> {
    this.#requestSequence += 1;
    const response = await this.#browser.sendMessage(tabId, createRequest({
      requestSequence: this.#requestSequence,
      intent,
      source: 'background',
      target: 'content',
      operation,
      payload,
    }));
    return requireSuccessfulValue(response);
  }
}
