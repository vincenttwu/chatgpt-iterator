import { ContractError, ERROR_CODES, createRequest, requireMessageEnvelope } from '../core/index.ts';
import type { JsonObject, MessageIntent } from '../core/types.ts';
import { requireRunSnapshot } from '../runs/model.ts';
import { RUN_RUNTIME_OPERATIONS, isRunTerminal, type DurableRunSnapshot, type RunLifecycleState } from '../runs/types.ts';
import { TAB_REGISTRY_SCHEMA_VERSION, TAB_RUNTIME_OPERATIONS, type ChatGptTabRegistrySnapshot } from '../tabs/types.ts';

export interface SidePanelOperationalRuntimeLike {
  sendMessage(message: unknown): Promise<unknown>;
}

export interface RepeatRunDraft {
  readonly targetTabId: number;
  readonly targetWindowId: number;
  readonly messageTemplate: string;
  readonly totalIterations: number;
  readonly delaySeconds: number;
  readonly autoContinue: boolean;
  readonly autoScroll: boolean;
  readonly preventDiscard: boolean;
}


export interface QueueRunDraft {
  readonly targetTabId: number;
  readonly targetWindowId: number;
  readonly queueId: string;
  readonly delaySeconds: number;
  readonly autoContinue: boolean;
  readonly autoScroll: boolean;
  readonly preventDiscard: boolean;
}

export interface RunProgressView {
  readonly completed: number;
  readonly total: number;
  readonly currentIteration: number | null;
  readonly percent: number;
}

function requireTabsSnapshot(value: unknown): ChatGptTabRegistrySnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ContractError(ERROR_CODES.invalidMessage, 'tab registry snapshot must be an object');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== TAB_REGISTRY_SCHEMA_VERSION || !Array.isArray(candidate.targets)) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'invalid tab registry snapshot');
  }
  return candidate as unknown as ChatGptTabRegistrySnapshot;
}

function requireRunMutation(value: unknown): DurableRunSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ContractError(ERROR_CODES.invalidMessage, 'run mutation result must be an object');
  }
  const candidate = value as Record<string, unknown>;
  return requireRunSnapshot(candidate.run);
}

export class SidePanelOperationalClient {
  readonly #runtime: SidePanelOperationalRuntimeLike;
  #requestSequence = 0;

  constructor(runtime: SidePanelOperationalRuntimeLike) {
    this.#runtime = runtime;
  }

  async refreshTabs(): Promise<ChatGptTabRegistrySnapshot> {
    return requireTabsSnapshot(await this.#request('query', TAB_RUNTIME_OPERATIONS.refresh, {}));
  }

  async bindTarget(tabId: number): Promise<ChatGptTabRegistrySnapshot> {
    return requireTabsSnapshot(await this.#request('command', TAB_RUNTIME_OPERATIONS.bind, { tabId }));
  }

  async listRuns(): Promise<DurableRunSnapshot[]> {
    const value = await this.#request('query', RUN_RUNTIME_OPERATIONS.list, {});
    if (!Array.isArray(value)) throw new ContractError(ERROR_CODES.invalidMessage, 'run.list result must be an array');
    return value.map((run) => requireRunSnapshot(run));
  }

  async startRepeat(draft: RepeatRunDraft): Promise<DurableRunSnapshot> {
    await this.bindTarget(draft.targetTabId);
    const created = requireRunMutation(await this.#request('command', RUN_RUNTIME_OPERATIONS.create, {
      targetTabId: draft.targetTabId,
      targetWindowId: draft.targetWindowId,
      messageTemplate: draft.messageTemplate,
      totalIterations: draft.totalIterations,
      delaySeconds: draft.delaySeconds,
      autoContinue: draft.autoContinue,
      autoScroll: draft.autoScroll,
      preventDiscard: draft.preventDiscard,
    }));
    return requireRunMutation(await this.#request('command', RUN_RUNTIME_OPERATIONS.start, {
      runId: created.id,
      expectedGeneration: created.generation,
    }));
  }

  async startQueue(draft: QueueRunDraft): Promise<DurableRunSnapshot> {
    await this.bindTarget(draft.targetTabId);
    const created = requireRunMutation(await this.#request('command', RUN_RUNTIME_OPERATIONS.create, {
      mode: 'queue',
      targetTabId: draft.targetTabId,
      targetWindowId: draft.targetWindowId,
      queueId: draft.queueId,
      delaySeconds: draft.delaySeconds,
      autoContinue: draft.autoContinue,
      autoScroll: draft.autoScroll,
      preventDiscard: draft.preventDiscard,
    }));
    return requireRunMutation(await this.#request('command', RUN_RUNTIME_OPERATIONS.start, { runId: created.id, expectedGeneration: created.generation }));
  }

  async start(run: DurableRunSnapshot): Promise<DurableRunSnapshot> {
    return requireRunMutation(await this.#request('command', RUN_RUNTIME_OPERATIONS.start, {
      runId: run.id,
      expectedGeneration: run.generation,
    }));
  }

  async pause(run: DurableRunSnapshot): Promise<DurableRunSnapshot> {
    return requireRunMutation(await this.#request('command', RUN_RUNTIME_OPERATIONS.pause, {
      runId: run.id,
      expectedGeneration: run.generation,
    }));
  }

  async resume(run: DurableRunSnapshot): Promise<DurableRunSnapshot> {
    return requireRunMutation(await this.#request('command', RUN_RUNTIME_OPERATIONS.resume, {
      runId: run.id,
      expectedGeneration: run.generation,
    }));
  }

  async stop(run: DurableRunSnapshot): Promise<DurableRunSnapshot> {
    return requireRunMutation(await this.#request('command', RUN_RUNTIME_OPERATIONS.stop, {
      runId: run.id,
      expectedGeneration: run.generation,
    }));
  }

  async #request(intent: MessageIntent, operation: string, payload: JsonObject): Promise<unknown> {
    const request = createRequest({
      requestSequence: ++this.#requestSequence,
      intent,
      source: 'sidepanel',
      target: 'background',
      operation,
      payload,
    });
    const response = requireMessageEnvelope(await this.#runtime.sendMessage(request));
    if (
      response.kind !== 'response'
      || response.requestId !== request.requestId
      || response.requestSequence !== request.requestSequence
      || response.operation !== operation
    ) {
      throw new ContractError(ERROR_CODES.invalidMessage, 'operational response correlation failed');
    }
    if (!response.outcome.ok) {
      throw new ContractError(response.outcome.error.code, response.outcome.error.message, response.outcome.error.details);
    }
    return response.outcome.value;
  }
}

export function choosePrimaryRun(runs: readonly DurableRunSnapshot[]): DurableRunSnapshot | undefined {
  const ordered = [...runs].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return ordered.find((run) => !isRunTerminal(run.lifecycleState)) ?? ordered[0];
}

export function runProgress(run: DurableRunSnapshot): RunProgressView {
  const total = run.execution.totalIterations;
  const completed = run.execution.completedIterations;
  const currentIteration = run.execution.activeIteration ?? (
    isRunTerminal(run.lifecycleState) ? null : Math.min(completed + 1, total)
  );
  return {
    completed,
    total,
    currentIteration,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function canPauseRun(state: RunLifecycleState): boolean {
  return state === 'running' || state === 'waiting_response' || state === 'waiting_delay' || state === 'frozen' || state === 'discarded';
}

export function canResumeRun(state: RunLifecycleState): boolean {
  return state === 'paused';
}

export function canStartExistingRun(state: RunLifecycleState): boolean {
  return state === 'ready';
}

export function canStopRun(state: RunLifecycleState): boolean {
  return !isRunTerminal(state);
}
