import { ContractError, ERROR_CODES } from '../core/index.ts';
import { ResponseCompletionTracker, type ChatGptAdapterSnapshot } from '../chatgpt/index.ts';
import { RUN_RESPONSE_STABLE_MS, RUN_RESPONSE_START_TIMEOUT_MS } from './types.ts';
import type { ChatGptRunClient } from './chatgpt-client.ts';
import type { ChatGptObservationHub } from './observation-hub.ts';

export interface ResponseWaitOptions {
  readonly autoContinue: boolean;
  readonly cancelled: () => boolean;
  readonly validateSnapshot?: (snapshot: ChatGptAdapterSnapshot) => void;
}

export class EventDrivenChatGptWaiter {
  readonly #client: ChatGptRunClient;
  readonly #hub: ChatGptObservationHub;
  readonly #now: () => number;
  readonly #responseStartTimeoutMs: number;
  readonly #responseStableMs: number;

  constructor(
    client: ChatGptRunClient,
    hub: ChatGptObservationHub,
    now: () => number = () => Date.now(),
    options: { responseStartTimeoutMs?: number; responseStableMs?: number } = {},
  ) {
    this.#client = client;
    this.#hub = hub;
    this.#now = now;
    this.#responseStartTimeoutMs = options.responseStartTimeoutMs ?? RUN_RESPONSE_START_TIMEOUT_MS;
    this.#responseStableMs = options.responseStableMs ?? RUN_RESPONSE_STABLE_MS;
  }

  async waitUntilIdle(tabId: number, cancelled: () => boolean, timeoutMs = this.#responseStartTimeoutMs): Promise<ChatGptAdapterSnapshot> {
    const started = this.#now();
    const initial = await this.#client.snapshot(tabId);
    if (cancelled()) throw new ContractError(ERROR_CODES.staleRequest, 'run execution cancelled');
    if (initial.composerHasDraft) throw new ContractError(ERROR_CODES.staleRequest, 'ChatGPT composer contains an unsent draft');
    if (initial.ready && !initial.busy && initial.sendAvailable) return initial;
    return await new Promise<ChatGptAdapterSnapshot>((resolve, reject) => {
      let settled = false;
      const finish = (error: unknown, snapshot?: ChatGptAdapterSnapshot) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        clearTimeout(timer);
        if (error !== null) reject(error);
        else resolve(snapshot!);
      };
      const inspect = (snapshot: ChatGptAdapterSnapshot) => {
        if (cancelled()) return finish(new ContractError(ERROR_CODES.staleRequest, 'run execution cancelled'));
        if (snapshot.composerHasDraft) return finish(new ContractError(ERROR_CODES.staleRequest, 'ChatGPT composer contains an unsent draft'));
        if (snapshot.ready && !snapshot.busy && snapshot.sendAvailable) finish(null, snapshot);
      };
      const unsubscribe = this.#hub.subscribe(tabId, inspect);
      const timer = setTimeout(() => finish(new ContractError(ERROR_CODES.unavailable, `ChatGPT did not become idle within ${timeoutMs}ms`)), timeoutMs);
      const latest = this.#hub.latest(tabId);
      if (latest !== undefined) inspect(latest);
    });
  }

  async waitForResponse(tabId: number, baselineFingerprint: string, options: ResponseWaitOptions): Promise<ChatGptAdapterSnapshot> {
    const tracker = new ResponseCompletionTracker(baselineFingerprint, this.#now(), {
      responseStartTimeoutMs: this.#responseStartTimeoutMs,
      responseStableMs: this.#responseStableMs,
    });
    let latest = await this.#client.snapshot(tabId);
    return await new Promise<ChatGptAdapterSnapshot>((resolve, reject) => {
      let settled = false;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      let continueInFlight = false;
      let continueFingerprint = '';
      const finish = (error: unknown, snapshot?: ChatGptAdapterSnapshot) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
        if (error !== null) reject(error);
        else resolve(snapshot!);
      };
      const scheduleDeadline = (deadlineAt: number | null) => {
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
        deadlineTimer = undefined;
        if (deadlineAt === null) return;
        deadlineTimer = setTimeout(() => inspect(latest), Math.max(0, deadlineAt - this.#now()));
      };
      const inspect = (snapshot: ChatGptAdapterSnapshot) => {
        latest = snapshot;
        if (options.cancelled()) return finish(new ContractError(ERROR_CODES.staleRequest, 'run execution cancelled'));
        try { options.validateSnapshot?.(snapshot); } catch (error) { return finish(error); }
        const progress = tracker.observe(snapshot, this.#now());
        if (progress.state === 'timed_out') return finish(new ContractError(ERROR_CODES.unavailable, 'ChatGPT response did not start before timeout'));
        if (progress.state === 'stable') return finish(null, snapshot);
        if (progress.state === 'continue_available') {
          if (!options.autoContinue) return finish(new ContractError(ERROR_CODES.unavailable, 'ChatGPT requires Continue but automatic Continue is disabled'));
          const fingerprint = `${snapshot.assistantFingerprint}:${snapshot.assistantMessageCount}`;
          if (!continueInFlight && continueFingerprint !== fingerprint) {
            continueFingerprint = fingerprint;
            continueInFlight = true;
            void this.#client.continueResponse(tabId).then(() => undefined).catch((error) => finish(error)).finally(() => { continueInFlight = false; });
          }
        }
        scheduleDeadline(progress.nextDeadlineAt);
      };
      const unsubscribe = this.#hub.subscribe(tabId, inspect);
      inspect(this.#hub.latest(tabId) ?? latest);
    });
  }
}
