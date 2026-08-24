import { ContractError, ERROR_CODES } from '../core/index.ts';
import type { ChatGptAdapterSnapshot } from '../chatgpt/types.ts';
import { QueueMessageSource, RepeatMessageSource } from '../messages/index.ts';
import type { AutoDiscardGuardManager } from '../tabs/discard-guard.ts';
import { conversationDisposition, isConversationCompatible } from './conversation.ts';
import type { ChatGptRunClient } from './chatgpt-client.ts';
import type { DurableRunManager } from './manager.ts';
import type { EventDrivenChatGptWaiter } from './response-waiter.ts';
import type { DurableRunScheduler } from './scheduler.ts';
import { isRunTerminal, type DurableRunSnapshot } from './types.ts';

function dueAt(now: string, delaySeconds: number): string { return new Date(Date.parse(now) + delaySeconds * 1000).toISOString(); }
function sourceFor(run: DurableRunSnapshot) { return run.execution.mode === 'queue' ? new QueueMessageSource(run.execution.items) : new RepeatMessageSource(run.execution.messageTemplate); }
function isConversationError(error: unknown): boolean {
  return error instanceof ContractError && (
    error.details?.adapterCode === 'conversation_changed'
    || error.details?.runReason === 'conversation_changed'
  );
}
function validateBoundConversation(run: DurableRunSnapshot, snapshot: ChatGptAdapterSnapshot): void {
  if (snapshot.conversation === undefined) return;
  if (!isConversationCompatible(run.conversationBinding, snapshot.conversation)) {
    throw new ContractError(ERROR_CODES.staleRequest, 'ChatGPT conversation changed during run execution', { runReason: 'conversation_changed' });
  }
}

export class RunCoordinator {
  readonly #manager: DurableRunManager;
  readonly #client: ChatGptRunClient;
  readonly #waiter: EventDrivenChatGptWaiter;
  readonly #scheduler: DurableRunScheduler;
  readonly #discardGuards: AutoDiscardGuardManager|undefined;
  readonly #tokens = new Map<string, number>();

  constructor(manager: DurableRunManager, client: ChatGptRunClient, waiter: EventDrivenChatGptWaiter, scheduler: DurableRunScheduler, discardGuards?: AutoDiscardGuardManager) {
    this.#manager = manager; this.#client = client; this.#waiter = waiter; this.#scheduler = scheduler; this.#discardGuards = discardGuards;
  }

  activate(snapshot: DurableRunSnapshot): void {
    const token = (this.#tokens.get(snapshot.id) ?? 0) + 1;
    this.#tokens.set(snapshot.id, token);
    void this.#activateGuardAndDrive(snapshot, token).catch((error) => this.#failIfCurrent(snapshot.id, token, error));
  }

  async #activateGuardAndDrive(snapshot: DurableRunSnapshot, token: number): Promise<void> {
    if (snapshot.execution.preventDiscard) await this.#discardGuards?.acquire(this.#guardOwner(snapshot.id), snapshot.targetTabId);
    await this.#drive(snapshot.id, token);
  }

  async cancel(runId: string): Promise<void> {
    this.#tokens.set(runId, (this.#tokens.get(runId) ?? 0) + 1);
    await this.#scheduler.cancel(runId);
    const current = await this.#manager.get(runId);
    if (current !== undefined && (isRunTerminal(current.lifecycleState) || current.lifecycleState === 'paused' || current.lifecycleState === 'ready')) await this.#discardGuards?.release(this.#guardOwner(runId));
  }

  async suspend(runId: string): Promise<void> {
    this.#tokens.set(runId, (this.#tokens.get(runId) ?? 0) + 1);
    await this.#scheduler.cancel(runId);
  }

  recover(snapshots: readonly DurableRunSnapshot[]): void {
    for (const snapshot of snapshots) {
      if (!isRunTerminal(snapshot.lifecycleState) && snapshot.lifecycleState !== 'ready' && snapshot.lifecycleState !== 'paused' && snapshot.lifecycleState !== 'frozen' && snapshot.lifecycleState !== 'discarded' && snapshot.lifecycleState !== 'reconnecting') this.activate(snapshot);
    }
  }

  async #drive(runId: string, token: number): Promise<void> {
    const run = await this.#manager.get(runId);
    if (run === undefined || this.#cancelled(runId, token)) return;
    if (isRunTerminal(run.lifecycleState)) { await this.#discardGuards?.release(this.#guardOwner(runId)); return; }
    if (run.lifecycleState === 'paused' || run.lifecycleState === 'frozen' || run.lifecycleState === 'discarded' || run.lifecycleState === 'reconnecting' || run.lifecycleState === 'ready') return;
    if (run.lifecycleState === 'running') return await this.#dispatchNext(run, token);
    if (run.lifecycleState === 'waiting_response') return await this.#awaitResponse(run, token);
    if (run.lifecycleState === 'waiting_delay') return await this.#scheduleDelay(run, token);
  }

  async #dispatchNext(run: DurableRunSnapshot, token: number): Promise<void> {
    if (run.execution.completedIterations >= run.execution.totalIterations) {
      const result = await this.#manager.complete(run.id, run.generation, this.#manager.createCommandId());
      if (!this.#cancelled(run.id, token)) await this.#drive(result.snapshot.id, token);
      return;
    }
    const iteration = run.execution.completedIterations + 1;
    const now = this.#manager.now();
    const item = sourceFor(run).next({ iteration, total:run.execution.totalIterations, remaining:run.execution.totalIterations - iteration, timestamp:now });
    if (item === null) throw new ContractError(ERROR_CODES.internal, 'message source unexpectedly exhausted');
    const idle = await this.#waiter.waitUntilIdle(run.targetTabId, () => this.#cancelled(run.id, token));
    if (this.#cancelled(run.id, token)) return;
    const latest = await this.#manager.get(run.id);
    if (latest === undefined || latest.lifecycleState !== 'running') return;
    let guarded;
    try {
      guarded = await this.#manager.reconcileConversation(latest.id, latest.generation, this.#manager.createCommandId(), idle.conversation);
    } catch (error) {
      if (error instanceof ContractError && error.code === ERROR_CODES.staleRequest) return;
      throw error;
    }
    const current = guarded.snapshot;
    if (current.lifecycleState === 'paused' && current.suspensionReason === 'conversation_changed') { await this.suspend(current.id); return; }
    if (current.lifecycleState !== 'running') return;
    if (current.execution.autoScroll) await this.#client.scrollToBottom(current.targetTabId);
    const prepared = (await this.#manager.prepareIteration(current.id, current.generation, this.#manager.createCommandId(), { iteration, message:item.content, delayAfterSeconds:item.delayAfterSeconds, assistantBaselineFingerprint:idle.assistantFingerprint })).snapshot;
    if (this.#cancelled(run.id, token)) return;
    const fresh = await this.#manager.get(run.id);
    if (fresh === undefined || fresh.generation !== prepared.generation || fresh.lifecycleState !== 'waiting_response') return;
    try {
      await this.#client.send(current.targetTabId, item.content, idle.assistantFingerprint, idle.conversation);
    } catch (error) {
      if (!isConversationError(error)) throw error;
      const afterError = await this.#manager.get(run.id);
      if (afterError !== undefined && !isRunTerminal(afterError.lifecycleState)) {
        try { await this.#manager.suspendConversationChange(afterError.id, afterError.generation, this.#manager.createCommandId(), true); }
        catch (transitionError) { if (!(transitionError instanceof ContractError && transitionError.code === ERROR_CODES.staleRequest)) throw transitionError; }
      }
      await this.suspend(run.id);
      return;
    }
    if (this.#cancelled(run.id, token)) return;
    await this.#awaitResponse(prepared, token);
  }

  async #awaitResponse(run: DurableRunSnapshot, token: number): Promise<void> {
    const baseline = run.execution.assistantBaselineFingerprint;
    if (baseline === null || run.execution.activeIteration === null) throw new ContractError(ERROR_CODES.internal, 'waiting response state lacks message baseline');
    let finalSnapshot: ChatGptAdapterSnapshot;
    try {
      finalSnapshot = await this.#waiter.waitForResponse(run.targetTabId, baseline, {
        autoContinue:run.execution.autoContinue,
        cancelled:() => this.#cancelled(run.id, token),
        validateSnapshot:(snapshot) => validateBoundConversation(run, snapshot),
      });
    } catch (error) {
      if (!isConversationError(error)) throw error;
      const current = await this.#manager.get(run.id);
      if (current !== undefined && !isRunTerminal(current.lifecycleState)) {
        try { await this.#manager.suspendConversationChange(current.id, current.generation, this.#manager.createCommandId(), false); }
        catch (transitionError) { if (!(transitionError instanceof ContractError && transitionError.code === ERROR_CODES.staleRequest)) throw transitionError; }
      }
      await this.suspend(run.id);
      return;
    }
    if (this.#cancelled(run.id, token)) return;
    let current = await this.#manager.get(run.id);
    if (current === undefined || current.lifecycleState !== 'waiting_response') return;
    try {
      const guarded = await this.#manager.reconcileConversation(current.id, current.generation, this.#manager.createCommandId(), finalSnapshot.conversation);
      current = guarded.snapshot;
    } catch (error) {
      if (error instanceof ContractError && error.code === ERROR_CODES.staleRequest) return;
      throw error;
    }
    if (current.lifecycleState === 'paused' && current.suspensionReason === 'conversation_changed') { await this.suspend(current.id); return; }
    if (current.lifecycleState !== 'waiting_response') return;
    const activeIteration = current.execution.activeIteration;
    if (activeIteration === null) throw new ContractError(ERROR_CODES.internal, 'waiting response lost active iteration');
    const final = activeIteration >= current.execution.totalIterations;
    const delay = current.execution.activeDelayAfterSeconds ?? current.execution.delaySeconds;
    const nextDueAt = final ? null : dueAt(this.#manager.now(), delay);
    const result = await this.#manager.completeIteration(current.id, current.generation, this.#manager.createCommandId(), nextDueAt);
    if (!this.#cancelled(run.id, token)) await this.#drive(result.snapshot.id, token);
  }

  async #scheduleDelay(run: DurableRunSnapshot, token: number): Promise<void> {
    const nextDueAt = run.execution.nextDueAt;
    if (nextDueAt === null) throw new ContractError(ERROR_CODES.internal, 'waiting delay state lacks nextDueAt');
    await this.#scheduler.schedule(run.id, run.generation, nextDueAt, () => { void this.#onDelay(run.id, run.generation, token).catch((error) => this.#failIfCurrent(run.id, token, error)); });
  }

  async #onDelay(runId: string, generation: number, token: number): Promise<void> {
    if (this.#cancelled(runId, token)) return;
    const current = await this.#manager.get(runId);
    if (current === undefined || current.generation !== generation || current.lifecycleState !== 'waiting_delay') return;
    const result = await this.#manager.delayElapsed(runId, generation, this.#manager.createCommandId());
    if (!this.#cancelled(runId, token)) await this.#drive(result.snapshot.id, token);
  }

  #cancelled(runId: string, token: number): boolean { return this.#tokens.get(runId) !== token; }
  #guardOwner(runId: string): string { return `run:${runId}`; }

  async #failIfCurrent(runId: string, token: number, error: unknown): Promise<void> {
    if (this.#cancelled(runId, token)) return;
    const current = await this.#manager.get(runId);
    if (current === undefined || isRunTerminal(current.lifecycleState) || current.lifecycleState === 'paused' || current.lifecycleState === 'frozen' || current.lifecycleState === 'discarded' || current.lifecycleState === 'reconnecting') return;
    if (isConversationError(error)) {
      try { await this.#manager.suspendConversationChange(runId, current.generation, this.#manager.createCommandId(), false); await this.suspend(runId); }
      catch (transitionError) { if (!(transitionError instanceof ContractError && transitionError.code === ERROR_CODES.staleRequest)) throw transitionError; }
      return;
    }
    const code = error instanceof ContractError ? error.code : 'run_execution_failed';
    const message = error instanceof Error ? error.message : 'Run execution failed';
    try {
      await this.#manager.fail(runId, current.generation, this.#manager.createCommandId(), { code:String(code).slice(0,64), message:message.slice(0,512) });
      await this.#discardGuards?.release(this.#guardOwner(runId));
    } catch (transitionError) {
      if (!(transitionError instanceof ContractError && transitionError.code === ERROR_CODES.staleRequest)) throw transitionError;
    }
  }
}

/** Backward-compatible STEP-08 name; both Repeat and Queue use the same coordinator. */
export class RepeatRunCoordinator extends RunCoordinator {}
