import { freezeJsonValue } from '../core/json.ts';
import type { ChatGptAdapterSnapshot, ResponseProgress } from './types.ts';
import { CHATGPT_ADAPTER_SCHEMA_VERSION } from './types.ts';

export interface ResponseTrackerOptions {
  readonly responseStartTimeoutMs?: number;
  readonly responseStableMs?: number;
}

export class ResponseCompletionTracker {
  readonly #baselineSignature: string;
  readonly #startedAt: number;
  readonly #responseStartTimeoutMs: number;
  readonly #responseStableMs: number;
  #observedActivity = false;
  #lastSignature: string;
  #lastChangeAt: number;

  constructor(baselineSignature: string, startedAt: number, options: ResponseTrackerOptions = {}) {
    this.#baselineSignature = baselineSignature;
    this.#startedAt = startedAt;
    this.#responseStartTimeoutMs = options.responseStartTimeoutMs ?? 120_000;
    this.#responseStableMs = options.responseStableMs ?? 3_500;
    this.#lastSignature = baselineSignature;
    this.#lastChangeAt = startedAt;
  }

  observe(snapshot: ChatGptAdapterSnapshot, now: number): ResponseProgress {
    if (snapshot.continueAvailable) {
      this.#observedActivity = true;
      return this.#result('continue_available', snapshot.assistantSignature, null);
    }

    if (snapshot.busy || snapshot.assistantSignature !== this.#baselineSignature) this.#observedActivity = true;
    if (snapshot.assistantSignature !== this.#lastSignature) {
      this.#lastSignature = snapshot.assistantSignature;
      this.#lastChangeAt = now;
    }

    if (this.#observedActivity && !snapshot.busy) {
      const stableAt = this.#lastChangeAt + this.#responseStableMs;
      if (now >= stableAt) return this.#result('stable', snapshot.assistantSignature, null);
      return this.#result('active', snapshot.assistantSignature, stableAt);
    }

    if (!this.#observedActivity) {
      const timeoutAt = this.#startedAt + this.#responseStartTimeoutMs;
      if (now >= timeoutAt) return this.#result('timed_out', snapshot.assistantSignature, null);
      return this.#result('waiting_start', snapshot.assistantSignature, timeoutAt);
    }

    return this.#result('active', snapshot.assistantSignature, null);
  }

  #result(state: ResponseProgress['state'], assistantSignature: string, nextDeadlineAt: number | null): ResponseProgress {
    return freezeJsonValue({
      schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
      state,
      observedActivity: this.#observedActivity,
      assistantSignature,
      nextDeadlineAt,
    });
  }
}
