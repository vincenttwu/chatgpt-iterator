import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope } from '../core/index.ts';
import type { RequestEnvelope } from '../core/envelope.ts';
import type { NamespacedChromeStorage } from '../persistence/chrome-storage.ts';
import {
  defaultInPageControllerPreference,
  INPAGE_CONTROLLER_OPERATIONS,
  INPAGE_CONTROLLER_STORAGE_KEY,
  projectInPageControllerStatus,
  requireInPageControllerPreference,
  type InPageControllerSnapshot,
} from '../presentation/inpage-controller.ts';
import { isInPageControllerDock, type InPageControllerDock } from '../presentation/inpage-placement.ts';
import { isRunTerminal } from '../runs/types.ts';
import type { DurableRunManager } from '../runs/manager.ts';
import type { ChatGptTabTarget } from '../tabs/types.ts';
import type { RuntimeCallerContext } from './caller-context.ts';
import { executeRunControl, type RunControlAction, type RunExecutionController } from './run-control.ts';

export type InPageRunManagerProvider = () => Promise<DurableRunManager>;
export type InPageExecutionProvider = () => Promise<RunExecutionController>;
export type InPageTargetProvider = (tabId: number, windowId: number) => Promise<ChatGptTabTarget|undefined>;
export type InPagePanelOpener = (tabId: number, windowId: number) => Promise<void>;

function requireRequest(raw: unknown): RequestEnvelope {
  const message = requireMessageEnvelope(raw);
  if (message.kind !== 'request') throw new ContractError(ERROR_CODES.invalidMessage, 'in-page runtime accepts requests only');
  if (message.target !== 'background' || message.source !== 'content') throw new ContractError(ERROR_CODES.invalidMessage, 'in-page runtime requires content-to-background requests');
  return message;
}

function requireLocalCaller(caller: RuntimeCallerContext): { readonly tabId:number; readonly windowId:number } {
  if (caller.kind !== 'chatgpt_content' || caller.tabId === null || caller.windowId === null) throw new ContractError(ERROR_CODES.invalidMessage, 'in-page runtime requires a verified ChatGPT content caller');
  return { tabId:caller.tabId, windowId:caller.windowId };
}

function requireRunId(payload: Record<string, unknown>): string {
  if (typeof payload.runId !== 'string' || payload.runId.length === 0) throw new ContractError(ERROR_CODES.invalidMessage, 'runId is required');
  return payload.runId;
}

function requireGeneration(payload: Record<string, unknown>): number {
  if (!Number.isSafeInteger(payload.expectedGeneration) || (payload.expectedGeneration as number) < 1) throw new ContractError(ERROR_CODES.invalidMessage, 'expectedGeneration must be a positive safe integer');
  return payload.expectedGeneration as number;
}

export class InPageControllerRuntimeServer {
  readonly #manager: InPageRunManagerProvider;
  readonly #execution: InPageExecutionProvider|undefined;
  readonly #target: InPageTargetProvider;
  readonly #panel: InPagePanelOpener;
  readonly #storage: NamespacedChromeStorage;

  constructor(manager: InPageRunManagerProvider, execution: InPageExecutionProvider|undefined, target: InPageTargetProvider, panel: InPagePanelOpener, storage: NamespacedChromeStorage) {
    this.#manager = manager;
    this.#execution = execution;
    this.#target = target;
    this.#panel = panel;
    this.#storage = storage;
  }

  async #preference() {
    const stored = await this.#storage.get(INPAGE_CONTROLLER_STORAGE_KEY);
    if (stored === undefined) return defaultInPageControllerPreference();
    try { return requireInPageControllerPreference(stored); }
    catch {
      const fallback = defaultInPageControllerPreference();
      await this.#storage.set(INPAGE_CONTROLLER_STORAGE_KEY, fallback);
      return fallback;
    }
  }

  async #setCollapsed(collapsed: boolean): Promise<void> {
    const stored = await this.#storage.get(INPAGE_CONTROLLER_STORAGE_KEY);
    if (stored !== undefined && stored !== null && !Array.isArray(stored) && typeof stored === 'object' && !('dock' in stored)) {
      await this.#storage.set(INPAGE_CONTROLLER_STORAGE_KEY, { schemaVersion:1, collapsed });
      return;
    }
    const current = await this.#preference();
    await this.#storage.set(INPAGE_CONTROLLER_STORAGE_KEY, { ...current, collapsed });
  }

  async #setDock(dock: InPageControllerDock): Promise<void> {
    const current = await this.#preference();
    await this.#storage.set(INPAGE_CONTROLLER_STORAGE_KEY, { ...current, dock });
  }

  async #status(tabId: number, windowId: number): Promise<InPageControllerSnapshot> {
    const manager = await this.#manager();
    const target = await this.#target(tabId, windowId);
    return projectInPageControllerStatus(await manager.list(), target, await this.#preference());
  }

  async #requireOwnedRun(manager: DurableRunManager, runId: string, tabId: number, windowId: number) {
    const run = await manager.get(runId);
    if (run === undefined || isRunTerminal(run.lifecycleState)) throw new ContractError(ERROR_CODES.unavailable, 'local active run is no longer available');
    if (run.targetTabId !== tabId || run.targetWindowId !== windowId) throw new ContractError(ERROR_CODES.invalidMessage, 'content caller cannot operate another tab run');
    return run;
  }

  async #control(action: RunControlAction, request: RequestEnvelope, tabId: number, windowId: number): Promise<InPageControllerSnapshot> {
    const manager = await this.#manager();
    const payload = request.payload as Record<string, unknown>;
    const runId = requireRunId(payload);
    let expectedGeneration = requireGeneration(payload);
    const current = await this.#requireOwnedRun(manager, runId, tabId, windowId);
    if (current.generation !== expectedGeneration) throw new ContractError(ERROR_CODES.staleRequest, `run generation is ${current.generation}, expected ${expectedGeneration}`);
    if (action === 'resume') {
      const target = await this.#target(tabId, windowId);
      if (target === undefined || target.lifecycleState !== 'ready' || target.conversation.kind === 'unsupported') throw new ContractError(ERROR_CODES.staleRequest, 'local ChatGPT target is not ready to resume');
      const guarded = await manager.reconcileConversation(runId, expectedGeneration, manager.createCommandId(), target.conversation);
      if (guarded.snapshot.lifecycleState === 'paused' && guarded.snapshot.suspensionReason === 'conversation_changed') {
        throw new ContractError(ERROR_CODES.staleRequest, 'ChatGPT conversation changed; open the Side Panel to rebind before continuing');
      }
      expectedGeneration = guarded.snapshot.generation;
    }
    const execution = this.#execution === undefined ? undefined : await this.#execution();
    await executeRunControl(manager, execution, action, runId, expectedGeneration, request.requestId);
    return await this.#status(tabId, windowId);
  }

  async handle(raw: unknown, caller: RuntimeCallerContext): Promise<unknown> {
    let request: RequestEnvelope|undefined;
    try {
      request = requireRequest(raw);
      const { tabId, windowId } = requireLocalCaller(caller);
      switch (request.operation) {
        case INPAGE_CONTROLLER_OPERATIONS.status:
          if (request.intent !== 'query') throw new ContractError(ERROR_CODES.invalidMessage, 'inpage.status must be a query');
          return createSuccessResponse(request, await this.#status(tabId, windowId));
        case INPAGE_CONTROLLER_OPERATIONS.setCollapsed: {
          if (request.intent !== 'command' || typeof (request.payload as Record<string, unknown>).collapsed !== 'boolean') throw new ContractError(ERROR_CODES.invalidMessage, 'inpage.setcollapsed requires a boolean collapsed value');
          await this.#setCollapsed((request.payload as Record<string, unknown>).collapsed as boolean);
          return createSuccessResponse(request, await this.#status(tabId, windowId));
        }
        case INPAGE_CONTROLLER_OPERATIONS.setDock: {
          const dock = (request.payload as Record<string, unknown>).dock;
          if (request.intent !== 'command' || !isInPageControllerDock(dock)) throw new ContractError(ERROR_CODES.invalidMessage, 'inpage.setdock requires a canonical dock value');
          await this.#setDock(dock);
          return createSuccessResponse(request, await this.#status(tabId, windowId));
        }
        case INPAGE_CONTROLLER_OPERATIONS.pause:
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'inpage.pause must be a command');
          return createSuccessResponse(request, await this.#control('pause', request, tabId, windowId));
        case INPAGE_CONTROLLER_OPERATIONS.resume:
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'inpage.resume must be a command');
          return createSuccessResponse(request, await this.#control('resume', request, tabId, windowId));
        case INPAGE_CONTROLLER_OPERATIONS.stop:
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'inpage.stop must be a command');
          return createSuccessResponse(request, await this.#control('stop', request, tabId, windowId));
        case INPAGE_CONTROLLER_OPERATIONS.openPanel:
          if (request.intent !== 'command') throw new ContractError(ERROR_CODES.invalidMessage, 'inpage.openpanel must be a command');
          await this.#panel(tabId, windowId);
          return createSuccessResponse(request, { opened:true });
        default:
          throw new ContractError(ERROR_CODES.unsupportedOperation, `Unsupported in-page operation: ${request.operation}`);
      }
    } catch (error) {
      if (request !== undefined) return createFailureResponse(request, error);
      throw error;
    }
  }
}
