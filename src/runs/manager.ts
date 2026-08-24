import { ContractError, ERROR_CODES } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import type { ChatGptConversationContext } from '../chatgpt/types.ts';
import type { ChatGptTabRegistrySnapshot, ChatGptTabLifecycleState } from '../tabs/types.ts';
import { createQueueRunState, createReadyRun, createRepeatRunState, nextRunState, requireRunExecutionState } from './model.ts';
import { conversationBindingFromContext, conversationDisposition } from './conversation.ts';
import { DurableRunRepository, type RunMutationResult } from './repository.ts';
import { isRunActive, isRunTerminal, type DurableRunSnapshot, type RunActiveState, type RunExecutionState } from './types.ts';

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

function executionWith(current: DurableRunSnapshot, patch: Record<string, unknown>): RunExecutionState {
  return requireRunExecutionState({ ...current.execution, ...patch });
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
    mode?: unknown;
    queueId?: unknown;
    queueRevision?: unknown;
    queueItems?: unknown;
    conversationContext?: ChatGptConversationContext;
  }): Promise<RunMutationResult> {
    const now = this.#repository.now();
    const execution = input.mode === 'queue'
      ? createQueueRunState({ queueId: input.queueId, queueRevision: input.queueRevision, items: input.queueItems, delaySeconds: input.delaySeconds, autoContinue: input.autoContinue, autoScroll: input.autoScroll, preventDiscard: input.preventDiscard })
      : createRepeatRunState({ messageTemplate: input.messageTemplate, totalIterations: input.totalIterations, delaySeconds: input.delaySeconds, autoContinue: input.autoContinue, autoScroll: input.autoScroll, preventDiscard: input.preventDiscard });
    const snapshot = createReadyRun({
      id: input.runId ?? this.#repository.createId(),
      targetTabId: requireTabId(input.targetTabId, 'targetTabId'),
      targetWindowId: requireTabId(input.targetWindowId, 'targetWindowId'),
      now,
      execution,
      conversationContext: input.conversationContext,
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
    assistantBaselineFingerprint: string;
    delayAfterSeconds?: number | null;
  }): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'iteration_prepared', (current, now) => {
      if (current.lifecycleState !== 'running') throw new ContractError(ERROR_CODES.staleRequest, `cannot prepare iteration from ${current.lifecycleState}`);
      if (input.iteration !== current.execution.completedIterations + 1 || input.iteration > current.execution.totalIterations) {
        throw new ContractError(ERROR_CODES.staleRequest, 'iteration number is not the next run item');
      }
      const execution = executionWith(current, {
        activeIteration: input.iteration,
        activeMessage: input.message,
        activeDelayAfterSeconds: input.delayAfterSeconds ?? null,
        assistantBaselineFingerprint: input.assistantBaselineFingerprint,
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
        activeDelayAfterSeconds: null,
        assistantBaselineFingerprint: null,
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
      if (!(isRunActive(current.lifecycleState) || current.lifecycleState === 'frozen' || current.lifecycleState === 'discarded' || current.lifecycleState === 'reconnecting')) {
        throw new ContractError(ERROR_CODES.staleRequest, `cannot pause run from ${current.lifecycleState}`);
      }
      return nextRunState(current, { lifecycleState: 'paused', resumeState: resumeBase(current), suspensionReason: 'user', now });
    });
  }

  async resume(runId: string, expectedGeneration: unknown, commandId: string): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'resumed', (current, now) => {
      if (current.lifecycleState !== 'paused') throw new ContractError(ERROR_CODES.staleRequest, `cannot resume run from ${current.lifecycleState}`);
      if (current.suspensionReason === 'browser_session_reset' || current.suspensionReason === 'conversation_changed') throw new ContractError(ERROR_CODES.staleRequest, 'rebind the intended ChatGPT tab and conversation before resuming');
      return nextRunState(current, { lifecycleState: current.resumeState ?? 'running', suspensionReason: null, now });
    });
  }

  async rebind(runId: string, expectedGeneration: unknown, commandId: string, targetTabId: unknown, targetWindowId: unknown, conversationContext?: ChatGptConversationContext): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'target_rebound', (current, now) => {
      if (current.lifecycleState !== 'paused' || (current.suspensionReason !== 'browser_session_reset' && current.suspensionReason !== 'conversation_changed')) {
        throw new ContractError(ERROR_CODES.staleRequest, 'run target can only be rebound after a browser-session reset or conversation change');
      }
      if (conversationContext?.kind === 'unsupported') throw new ContractError(ERROR_CODES.staleRequest, 'selected target is not on a supported ChatGPT conversation route');
      const nextBinding = conversationContext === undefined ? current.conversationBinding : conversationBindingFromContext(conversationContext);
      if (current.suspensionReason === 'browser_session_reset' && current.conversationBinding.kind === 'conversation') {
        if (nextBinding.kind !== 'conversation' || nextBinding.conversationId !== current.conversationBinding.conversationId) {
          throw new ContractError(ERROR_CODES.staleRequest, 'browser-session rebind must return to the previously bound ChatGPT conversation');
        }
      }
      if (current.suspensionReason === 'conversation_changed' && current.resumeState === 'waiting_response' && current.conversationBinding.kind === 'conversation') {
        if (nextBinding.kind !== 'conversation' || nextBinding.conversationId !== current.conversationBinding.conversationId) {
          throw new ContractError(ERROR_CODES.staleRequest, 'a run waiting for a response must rebind to its previously bound conversation');
        }
      }
      return nextRunState(current, {
        lifecycleState: 'paused',
        resumeState: current.resumeState,
        suspensionReason: null,
        targetTabId: requireTabId(targetTabId, 'targetTabId'),
        targetWindowId: requireTabId(targetWindowId, 'targetWindowId'),
        conversationBinding: nextBinding,
        now,
      });
    }, { recovery: 'explicit_rebind' });
  }

  async reconcileConversation(runId: string, expectedGeneration: unknown, commandId: string, context?: ChatGptConversationContext): Promise<RunMutationResult> {
    const expectedGenerationNumber = requireGeneration(expectedGeneration);
    const current = await this.#repository.get(runId);
    if (current === undefined) throw new ContractError(ERROR_CODES.unavailable, 'run not found');
    if (current.generation !== expectedGenerationNumber) throw new ContractError(ERROR_CODES.staleRequest, `run generation is ${current.generation}, expected ${expectedGenerationNumber}`);
    if (context === undefined) return { snapshot: current, idempotent: true };
    const disposition = conversationDisposition(current.conversationBinding, context);
    if (disposition === 'match') return { snapshot: current, idempotent: true };
    if (disposition === 'adopt') {
      return await this.#transition(runId, expectedGenerationNumber, commandId, 'conversation_bound', (state, now) => nextRunState(state, {
        lifecycleState: state.lifecycleState,
        resumeState: state.resumeState,
        suspensionReason: state.suspensionReason,
        conversationBinding: conversationBindingFromContext(context),
        now,
      }), { conversation: 'pending_to_bound' });
    }
    return await this.suspendConversationChange(runId, expectedGenerationNumber, commandId, false);
  }

  async suspendConversationChange(runId: string, expectedGeneration: unknown, commandId: string, safeToRetryPreparedIteration: boolean): Promise<RunMutationResult> {
    return await this.#transition(runId, expectedGeneration, commandId, 'conversation_suspended', (current, now) => {
      let resumeState = resumeBase(current);
      let execution = current.execution;
      if (safeToRetryPreparedIteration && current.lifecycleState === 'waiting_response' && current.execution.activeIteration !== null) {
        resumeState = 'running';
        execution = executionWith(current, {
          activeIteration: null,
          activeMessage: null,
          activeDelayAfterSeconds: null,
          assistantBaselineFingerprint: null,
          nextDueAt: null,
        });
      }
      return nextRunState(current, { lifecycleState: 'paused', resumeState, suspensionReason: 'conversation_changed', execution, now });
    }, { reason: 'conversation_changed', safeToRetryPreparedIteration });
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

  async recoverBrowserSession(commandIdFactory: () => string = () => this.#repository.createId()): Promise<DurableRunSnapshot[]> {
    const runs = await this.#repository.list();
    const recovered: DurableRunSnapshot[] = [];
    for (const run of runs) {
      if (isRunTerminal(run.lifecycleState)) continue;
      const suspend = run.lifecycleState !== 'ready' && run.lifecycleState !== 'paused';
      const result = await this.#transition(run.id, run.generation, commandIdFactory(), 'browser_session_recovered', (current, now) => nextRunState(current, {
        lifecycleState: suspend ? 'paused' : current.lifecycleState,
        resumeState: suspend ? resumeBase(current) : current.resumeState,
        suspensionReason: suspend ? 'browser_session_reset' : current.suspensionReason,
        now,
      }), { recovery: 'browser_session_reset' });
      recovered.push(result.snapshot);
    }
    return recovered;
  }

  async reconcileTabs(snapshot: ChatGptTabRegistrySnapshot, commandIdFactory: () => string = () => this.#repository.createId()): Promise<void> {
    const runs = await this.#repository.list();
    for (const initialRun of runs) {
      if (isRunTerminal(initialRun.lifecycleState)) continue;
      let run = initialRun;
      const target = snapshot.targets.find((candidate) => candidate.tabId === run.targetTabId && candidate.windowId === run.targetWindowId);
      try {
        if (run.lifecycleState === 'paused' && run.suspensionReason === 'browser_session_reset') continue;
        if (target === undefined) {
          if (run.lifecycleState === 'ready' || run.lifecycleState === 'paused') continue;
          const termination = snapshot.lastTermination;
          if (termination?.tabId === run.targetTabId && termination.windowId === run.targetWindowId) {
            await this.fail(run.id, run.generation, commandIdFactory(), { code: termination.reason, message: 'Target ChatGPT tab is no longer available.' });
          } else {
            await this.#applyTabLifecycle(run, 'unavailable', commandIdFactory);
          }
          continue;
        }
        const conversationResult = await this.reconcileConversation(run.id, run.generation, commandIdFactory(), target.conversation);
        run = conversationResult.snapshot;
        if (run.lifecycleState === 'paused' && run.suspensionReason === 'conversation_changed') continue;
        if (run.lifecycleState === 'ready' || run.lifecycleState === 'paused') continue;
        await this.#applyTabLifecycle(run, target.lifecycleState, commandIdFactory);
      } catch (error) {
        if (error instanceof ContractError && error.code === ERROR_CODES.staleRequest) continue;
        throw error;
      }
    }
  }

  async #applyTabLifecycle(run: DurableRunSnapshot, lifecycle: ChatGptTabLifecycleState, commandIdFactory: () => string): Promise<void> {
    if (lifecycle === 'frozen' || lifecycle === 'discarded' || lifecycle === 'loading' || lifecycle === 'unavailable') {
      const nextLifecycle = lifecycle === 'loading' || lifecycle === 'unavailable' ? 'reconnecting' : lifecycle;
      if (run.lifecycleState === nextLifecycle) return;
      if (!(isRunActive(run.lifecycleState) || run.lifecycleState === 'frozen' || run.lifecycleState === 'discarded' || run.lifecycleState === 'reconnecting')) return;
      const reason = nextLifecycle === 'frozen' ? 'tab_frozen' : nextLifecycle === 'discarded' ? 'tab_discarded' : 'tab_reconnecting';
      await this.#transition(run.id, run.generation, commandIdFactory(), 'tab_suspended', (current, now) => nextRunState(current, {
        lifecycleState: nextLifecycle,
        resumeState: resumeBase(current),
        suspensionReason: reason,
        now,
      }), { tabLifecycle: lifecycle });
      return;
    }
    if ((lifecycle === 'ready' || lifecycle === 'degraded') && (run.lifecycleState === 'frozen' || run.lifecycleState === 'discarded' || run.lifecycleState === 'reconnecting')) {
      await this.#transition(run.id, run.generation, commandIdFactory(), 'tab_recovered', (current, now) => nextRunState(current, {
        lifecycleState: current.resumeState ?? 'running',
        suspensionReason: null,
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
