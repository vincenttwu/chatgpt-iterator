import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';

export interface RuntimeMessageSenderLike {
  readonly id?: string;
  readonly tab?: {
    readonly id?: number;
    readonly windowId: number;
    readonly url?: string;
  };
  readonly frameId?: number;
  readonly documentId?: string;
  readonly origin?: string;
  readonly url?: string;
}

export type RuntimeCallerKind = 'sidepanel' | 'chatgpt_content';

export interface RuntimeCallerContext extends JsonObject {
  readonly kind: RuntimeCallerKind;
  readonly extensionId: string;
  readonly tabId: number | null;
  readonly windowId: number | null;
  readonly frameId: number | null;
  readonly documentId: string | null;
  readonly origin: string;
  readonly url: string;
}

export const FUTURE_MINI_CONTROLLER_ALLOWED_ACTIONS = Object.freeze(['pause', 'resume', 'stop'] as const);
export type FutureMiniControllerAction = (typeof FUTURE_MINI_CONTROLLER_ALLOWED_ACTIONS)[number];

function isChatGptOrigin(value: string): boolean {
  return value === 'https://chatgpt.com' || value === 'https://chat.openai.com';
}

function safeOrigin(value: string): string | null {
  try { return new URL(value).origin; } catch { return null; }
}

function isSidePanelUrl(value: string, extensionId: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'chrome-extension:' || url.hostname !== extensionId) return false;
    return url.pathname === '/sidepanel.html' || url.pathname === '/sidepanel/index.html' || url.pathname.endsWith('/sidepanel.html');
  } catch {
    return false;
  }
}

export function resolveRuntimeCaller(sender: RuntimeMessageSenderLike, extensionId: string): RuntimeCallerContext {
  if (typeof extensionId !== 'string' || extensionId.length === 0) throw new ContractError(ERROR_CODES.internal, 'runtime extension identity is unavailable');
  if (sender.id !== extensionId) throw new ContractError(ERROR_CODES.invalidMessage, 'runtime caller is not this extension');

  const url = sender.url ?? sender.tab?.url ?? '';
  const origin = sender.origin ?? safeOrigin(url) ?? '';

  if (sender.tab !== undefined) {
    const tabId = sender.tab.id;
    if (!Number.isSafeInteger(tabId) || (tabId as number) < 0 || !Number.isSafeInteger(sender.tab.windowId) || sender.tab.windowId < 0) {
      throw new ContractError(ERROR_CODES.invalidMessage, 'content caller requires valid sender tab identity');
    }
    if (sender.frameId !== 0) throw new ContractError(ERROR_CODES.invalidMessage, 'content caller must originate from the top frame');
    if (!isChatGptOrigin(origin) || !isChatGptOrigin(safeOrigin(url) ?? '')) {
      throw new ContractError(ERROR_CODES.invalidMessage, 'content caller must originate from an allowed ChatGPT origin');
    }
    return freezeJsonValue({
      kind: 'chatgpt_content' as const,
      extensionId,
      tabId: tabId as number,
      windowId: sender.tab.windowId,
      frameId: 0,
      documentId: sender.documentId ?? null,
      origin,
      url,
    });
  }

  const extensionOrigin = `chrome-extension://${extensionId}`;
  if (origin !== extensionOrigin || !isSidePanelUrl(url, extensionId)) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'extension-page caller is not the ChatGPT Iterator Side Panel');
  }
  return freezeJsonValue({
    kind: 'sidepanel' as const,
    extensionId,
    tabId: null,
    windowId: null,
    frameId: null,
    documentId: sender.documentId ?? null,
    origin,
    url,
  });
}
