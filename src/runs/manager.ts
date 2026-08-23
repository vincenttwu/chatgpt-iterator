import { ContractError, ERROR_CODES } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import type { ChatGptTabRegistrySnapshot, ChatGptTabLifecycleState } from '../tabs/types.ts';
import { createReadyRun, createRepeatRunState, nextRunState, requireRepeatRunState } from './model.ts';
import { DurableRunRepository, type RunMutationResult } from './repository.ts';
import { isRunActive, isRunTerminal, type DurableRunSnapshot, type RepeatRunState, type RunActiveState } from './types.ts';

function requireGeneration(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new ContractError(ERROR_CODES.invalidMessage, 'expected generation must be a positive safe integer');
  return value as number;
}

function requireTabId(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ContractError(ERROR_CODES.invalidMessage, `${label} must be a non-negative safe integer`);
  return value as number;
}

function resumeBase(current: DurableRunSnapshot): RunActiveState {
  if (isRunActive(current.lifecycleState)) return current.lifecycleState;
  if (current.resumeState !== null) return current.resumeState;
  return 'running';
}

function executionWith(current: DurableRunSnapshot, patch: Partial<RepeatRunState>): RepeatRunState {
  return requireRepeatRunState({ ...current.execution, ...patch });
}

export class DurableRunManager {
  readonly #repository: DurableRunRepository;
  readonly #listeners = new Set<(snapshot: DurableRunSnapshot) => void>();

  constructor(repository: DurableRunRepository) { this.#repository = repository; }

  createCommandId(): string { return this.#repository.createId(); }
  now(): string { return this.#repository.now(); }

  subscribe(listener: (snapshot: DurableRunSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #publish(snapshot: DurableRunSnapshot): DurableRunSnapshot {
    for (const listener of this.#listeners) listener(snapshot);
    return snapshot;
  }

  async create(input: {
    targetTabId: unknown;
    targetWindowId: unknown;
    commandId: string;
    runId?: string;
    messageTemplate?: unknown;
    totalIterations?: unknown;
    delaySeconds?: unknown;
    autoContinue?: unknown;
    autoScroll?: unknown;
    preventDiscard?: unknown;
  }): Promise<RunMutationResult> {
    const now = this.#repository.now();
    const snapshot = createReadyRun({
      id: input.runId ?? this.#repository.createId(),
      targetTabId: requireTabId(input.targetTabId, 'targetTabId'),
      targetWindowId: requireTabId(input.targetWindowId, 'targetWindowId'),
      now,
      execution: createRepeatRunState({
        messageTemplate: input.messageTemplate,
        totalIterations: input.totalIterations,
        delaySeconds: input.delaySeconds,
        autoContinue: input.autoContinue,
        autoScroll: input.autoScroll,
        preventDiscard: input.preventDiscard,
      }),
    });
    const result = await this.#repository.create(snapshot, input.commandId);
    this.#publish(result.snapshot);
    return result;
  }

  async get(runId: string): Promise<DurableRunSnapshot | undefined> { return await this.#repository.get(runId); }
  async list(): Promise<DurableRunSnapshot[]> { return await this.#repository.list(); }

  async start(runId: string, expectedGeneration: unknown, commandId: string): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'started', (current, now) => {
      if (current.lifecycleState !== 'ready') throw new ContractError(ERROR_CODES.staleRequest, `cannot start run from ${current.lifecycleState}`);
      return nextRunState(current, { lifecycleState: 'running', now });
    });
  }

  async prepareIteration(runId: string, expectedGeneration: unknown, commandId: string, input: {
    iteration: number;
    message: string;
    assistantBaselineSignature: string;
  }): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'iteration_prepared', (current, now) => {
      if (current.lifecycleState !== 'running') throw new ContractError(ERROR_CODES.staleRequest, `cannot prepare iteration from ${current.lifecycleState}`);
      if (input.iteration !== current.execution.completedIterations + 1 || input.iteration > current.execution.totalIterations) {
        throw new ContractError(ERROR_CODES.staleRequest, 'iteration number is not the next repeat iteration');
      }
      const execution = executionWith(current, {
        activeIteration: input.iteration,
        activeMessage: input.message,
        assistantBaselineSignature: input.assistantBaselineSignature,
        nextDueAt: null,
      });
      return nextRunState(current, { lifecycleState: 'waiting_response', execution, now });
    }, { iteration: input.iteration });
  }

  async completeIteration(runId: string, expectedGeneration: unknown, commandId: string, nextDueAt: string | null): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'iteration_completed', (current, now) => {
      if (current.lifecycleState !== 'waiting_response' || current.execution.activeIteration === null) {
        throw new ContractError(ERROR_CODES.staleRequest, `cannot complete iteration from ${current.lifecycleState}`);
      }
      const completedIterations = current.execution.activeIteration;
      const done = completedIterations >= current.execution.totalIterations;
      const execution = executionWith(current, {
        completedIterations,
        activeIteration: null,
        activeMessage: null,
        assistantBaselineSignature: null,
        nextDueAt: done ? null : nextDueAt,
      });
      if (!done && nextDueAt === null) throw new ContractError(ERROR_CODES.invalidMessage, 'non-final iteration requires nextDueAt');
      return nextRunState(current, { lifecycleState: done ? 'completed' : 'waiting_delay', execution, now });
    }, { nextDueAt });
  }

  async delayElapsed(runId: string, expectedGeneration: unknown, commandId: string): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'delay_elapsed', (current, now) => {
      if (current.lifecycleState !== 'waiting_delay') throw new ContractError(ERROR_CODES.staleRequest, `cannot elapse delay from ${current.lifecycleState}`);
      const execution = executionWith(current, { nextDueAt: null });
      return nextRunState(current, { lifecycleState: 'running', execution, now });
    });
  }

  async setActiveState(runId: string, expectedGeneration: unknown, commandId: string, state: RunActiveState): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'state_changed', (current, now) => {
      if (!isRunActive(current.lifecycleState)) throw new ContractError(ERROR_CODES.staleRequest, `cannot enter ${state} from ${current.lifecycleState}`);
      return nextRunState(current, { lifecycleState: state, now });
    });
  }

  async pause(runId: string, expectedGeneration: unknown, commandId: string): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'paused', (current, now) => {
      if (!(isRunActive(current.lifecycleState) || current.lifecycleState === 'frozen' || current.lifecycleState === 'discarded')) {
        throw new ContractError(ERROR_CODES.staleRequest, `cannot pause run from ${current.lifecycleState}`);
      }
      return nextRunState(current, { lifecycleState: 'paused', resumeState: resumeBase(current), now });
    });
  }

  async resume(runId: string, expectedGeneration: unknown, commandId: string): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'resumed', (current, now) => {
      if (current.lifecycleState !== 'paused') throw new ContractError(ERROR_CODES.staleRequest, `cannot resume run from ${current.lifecycleState}`);
      return nextRunState(current, { lifecycleState: current.resumeState ?? 'running', now });
    });
  }

  async stop(runId: string, expectedGeneration: unknown, commandId: string): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'stopped', (current, now) => nextRunState(current, { lifecycleState: 'stopped', now }));
  }

  async complete(runId: string, expectedGeneration: unknown, commandId: string): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'completed', (current, now) => {
      if (!isRunActive(current.lifecycleState)) throw new ContractError(ERROR_CODES.staleRequest, `cannot complete run from ${current.lifecycleState}`);
      return nextRunState(current, { lifecycleState: 'completed', now });
    });
  }

  async fail(runId: string, expectedGeneration: unknown, commandId: string, failure: { code: string; message: string }): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'failed', (current, now) => nextRunState(current, { lifecycleState: 'failed', failure, now }));
  }

  async recoverWorker(commandIdFactory: () => string = () => this.#repository.createId()): Promise<DurableRunSnapshot[]> {
    const runs = await this.#repository.list();
    const recovered: DurableRunSnapshot[] = [];
    for (const run of runs) {
      if (isRunTerminal(run.lifecycleState)) continue;
      const result = await this.#transition(run.id, run.generation, commandIdFactory(), 'worker_recovered', (current, now) => nextRunState(current, {
        lifecycleState: current.lifecycleState,
        resumeState: current.resumeState,
        now,
      }), { recovery: 'worker_restart' });
      recovered.push(result.snapshot);
    }
    return recovered;
  }

  async reconcileTabs(snapshot: ChatGptTabRegistrySnapshot, commandIdFactory: () => string = () => this.#repository.createId()): Promise<void> {
    const runs = await this.#repository.list();
    for (const run of runs) {
      if (isRunTerminal(run.lifecycleState) || run.lifecycleState === 'ready' || run.lifecycleState === 'paused') continue;
      const target = snapshot.targets.find((candidate) => candidate.tabId === run.targetTabId && candidate.windowId === run.targetWindowId);
      try {
        if (target === undefined) {
          const termination = snapshot.lastTermination;
          if (termination?.tabId === run.targetTabId && termination.windowId === run.targetWindowId) {
            await this.fail(run.id, run.generation, commandIdFactory(), { code: termination.reason, message: 'Target ChatGPT tab is no longer available.' });
          }
          continue;
        }
        await this.#applyTabLifecycle(run, target.lifecycleState, commandIdFactory);
      } catch (error) {
        if (error instanceof ContractError && error.code === ERROR_CODES.staleRequest) continue;
        throw error;
      }
    }
  }

  async #applyTabLifecycle(run: DurableRunSnapshot, lifecycle: ChatGptTabLifecycleState, commandIdFactory: () => string): Promise<void> {
    if (lifecycle === 'frozen' || lifecycle === 'discarded') {
      if (run.lifecycleState === lifecycle) return;
      if (!(isRunActive(run.lifecycleState) || run.lifecycleState === 'frozen' || run.lifecycleState === 'discarded')) return;
      await this.#transition(run.id, run.generation, commandIdFactory(), 'tab_suspended', (current, now) => nextRunState(current, {
        lifecycleState: lifecycle,
        resumeState: resumeBase(current),
        now,
      }), { tabLifecycle: lifecycle });
      return;
    }
    if ((lifecycle === 'ready' || lifecycle === 'degraded') && (run.lifecycleState === 'frozen' || run.lifecycleState === 'discarded')) {
      await this.#transition(run.id, run.generation, commandIdFactory(), 'tab_recovered', (current, now) => nextRunState(current, {
        lifecycleState: current.resumeState ?? 'running',
        now,
      }), { tabLifecycle: lifecycle });
    }
  }

  async #transition(
    runId: string,
    expectedGenerationValue: unknown,
    commandId: string,
    eventType: Parameters<DurableRunRepository['mutate']>[0]['eventType'],
    transform: Parameters<DurableRunRepository['mutate']>[0]['transform'],
    payload?: JsonObject,
  ): Promise<RunMutationResult> {
    const result = await this.#repository.mutate({
      runId,
      expectedGeneration: requireGeneration(expectedGenerationValue),
      commandId,
      eventType,
      transform,
      ...(payload === undefined ? {} : { payload }),
    });
    this.#publish(result.snapshot);
    return result;
  }
}
