import { ContractError, ERROR_CODES } from '../core/index.ts';
import { RepeatMessageSource } from '../messages/index.ts';
import type { DurableRunManager } from './manager.ts';
import type { ChatGptRunClient } from './chatgpt-client.ts';
import type { EventDrivenChatGptWaiter } from './response-waiter.ts';
import type { DurableRunScheduler } from './scheduler.ts';
import { isRunTerminal, type DurableRunSnapshot } from './types.ts';

function dueAt(now: string, delaySeconds: number): string {
  return new Date(Date.parse(now) + delaySeconds * 1000).toISOString();
}

export class RepeatRunCoordinator {
  readonly #manager: DurableRunManager;
  readonly #client: ChatGptRunClient;
  readonly #waiter: EventDrivenChatGptWaiter;
  readonly #scheduler: DurableRunScheduler;
  readonly #tokens = new Map<string, number>();

  constructor(manager: DurableRunManager, client: ChatGptRunClient, waiter: EventDrivenChatGptWaiter, scheduler: DurableRunScheduler) {
    this.#manager = manager;
    this.#client = client;
    this.#waiter = waiter;
    this.#scheduler = scheduler;
  }

  activate(snapshot: DurableRunSnapshot): void {
    const token = (this.#tokens.get(snapshot.id) ?? 0) + 1;
    this.#tokens.set(snapshot.id, token);
    void this.#drive(snapshot.id, token).catch((error) => this.#failIfCurrent(snapshot.id, token, error));
  }

  async cancel(runId: string): Promise<void> {
    this.#tokens.set(runId, (this.#tokens.get(runId) ?? 0) + 1);
    await this.#scheduler.cancel(runId);
  }

  recover(snapshots: readonly DurableRunSnapshot[]): void {
    for (const snapshot of snapshots) {
      if (!isRunTerminal(snapshot.lifecycleState) && snapshot.lifecycleState !== 'ready' && snapshot.lifecycleState !== 'paused' && snapshot.lifecycleState !== 'frozen' && snapshot.lifecycleState !== 'discarded') {
        this.activate(snapshot);
      }
    }
  }

  async #drive(runId: string, token: number): Promise<void> {
    const run = await this.#manager.get(runId);
    if (run === undefined || this.#cancelled(runId, token) || isRunTerminal(run.lifecycleState)) return;
    if (run.lifecycleState === 'paused' || run.lifecycleState === 'frozen' || run.lifecycleState === 'discarded' || run.lifecycleState === 'ready') return;
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
    const source = new RepeatMessageSource(run.execution.messageTemplate);
    const item = source.next({
      iteration,
      total: run.execution.totalIterations,
      remaining: run.execution.totalIterations - iteration,
      timestamp: now,
    });
    if (item === null) throw new ContractError(ERROR_CODES.internal, 'repeat message source unexpectedly exhausted');

    const idle = await this.#waiter.waitUntilIdle(run.targetTabId, () => this.#cancelled(run.id, token));
    if (this.#cancelled(run.id, token)) return;
    const current = await this.#manager.get(run.id);
    if (current === undefined || current.generation !== run.generation || current.lifecycleState !== 'running') return;
    if (run.execution.autoScroll) await this.#client.scrollToBottom(run.targetTabId);

    const prepared = (await this.#manager.prepareIteration(run.id, run.generation, this.#manager.createCommandId(), {
      iteration,
      message: item.content,
      assistantBaselineSignature: idle.assistantSignature,
    })).snapshot;
    if (this.#cancelled(run.id, token)) return;
    const fresh = await this.#manager.get(run.id);
    if (fresh === undefined || fresh.generation !== prepared.generation || fresh.lifecycleState !== 'waiting_response') return;

    await this.#client.send(run.targetTabId, item.content, idle.assistantSignature);
    if (this.#cancelled(run.id, token)) return;
    await this.#awaitResponse(prepared, token);
  }

  async #awaitResponse(run: DurableRunSnapshot, token: number): Promise<void> {
    const baseline = run.execution.assistantBaselineSignature;
    if (baseline === null || run.execution.activeIteration === null) throw new ContractError(ERROR_CODES.internal, 'waiting response state lacks repeat baseline');
    await this.#waiter.waitForResponse(run.targetTabId, baseline, {
      autoContinue: run.execution.autoContinue,
      cancelled: () => this.#cancelled(run.id, token),
    });
    if (this.#cancelled(run.id, token)) return;
    const current = await this.#manager.get(run.id);
    if (current === undefined || current.generation !== run.generation || current.lifecycleState !== 'waiting_response') return;
    const activeIteration = current.execution.activeIteration;
    if (activeIteration === null) throw new ContractError(ERROR_CODES.internal, 'waiting response lost active iteration');
    const final = activeIteration >= current.execution.totalIterations;
    const nextDueAt = final ? null : dueAt(this.#manager.now(), current.execution.delaySeconds);
    const result = await this.#manager.completeIteration(current.id, current.generation, this.#manager.createCommandId(), nextDueAt);
    if (!this.#cancelled(run.id, token)) await this.#drive(result.snapshot.id, token);
  }

  async #scheduleDelay(run: DurableRunSnapshot, token: number): Promise<void> {
    const nextDueAt = run.execution.nextDueAt;
    if (nextDueAt === null) throw new ContractError(ERROR_CODES.internal, 'waiting delay state lacks nextDueAt');
    await this.#scheduler.schedule(run.id, run.generation, nextDueAt, () => {
      void this.#onDelay(run.id, run.generation, token).catch((error) => this.#failIfCurrent(run.id, token, error));
    });
  }

  async #onDelay(runId: string, generation: number, token: number): Promise<void> {
    if (this.#cancelled(runId, token)) return;
    const current = await this.#manager.get(runId);
    if (current === undefined || current.generation !== generation || current.lifecycleState !== 'waiting_delay') return;
    const result = await this.#manager.delayElapsed(runId, generation, this.#manager.createCommandId());
    if (!this.#cancelled(runId, token)) await this.#drive(result.snapshot.id, token);
  }

  #cancelled(runId: string, token: number): boolean { return this.#tokens.get(runId) !== token; }

  async #failIfCurrent(runId: string, token: number, error: unknown): Promise<void> {
    if (this.#cancelled(runId, token)) return;
    const current = await this.#manager.get(runId);
    if (current === undefined || isRunTerminal(current.lifecycleState) || current.lifecycleState === 'paused' || current.lifecycleState === 'frozen' || current.lifecycleState === 'discarded') return;
    const code = error instanceof ContractError ? error.code : 'repeat_execution_failed';
    const message = error instanceof Error ? error.message : 'Repeat execution failed';
    try {
      await this.#manager.fail(runId, current.generation, this.#manager.createCommandId(), { code: String(code).slice(0, 64), message: message.slice(0, 512) });
    } catch (failureError) {
      if (!(failureError instanceof ContractError && failureError.code === ERROR_CODES.staleRequest)) throw failureError;
    }
  }
}
