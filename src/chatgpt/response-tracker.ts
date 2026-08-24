import { freezeJsonValue } from '../core/json.ts';
import type { ChatGptAdapterSnapshot, ResponseProgress } from './types.ts';
import { CHATGPT_ADAPTER_SCHEMA_VERSION } from './types.ts';

export interface ResponseTrackerOptions {
  readonly responseStartTimeoutMs?: number;
  readonly responseStableMs?: number;
}

export class ResponseCompletionTracker {
  readonly #baselineFingerprint: string;
  readonly #startedAt: number;
  readonly #responseStartTimeoutMs: number;
  readonly #responseStableMs: number;
  #observedActivity = false;
  #lastFingerprint: string;
  #lastChangeAt: number;

  constructor(baselineFingerprint: string, startedAt: number, options: ResponseTrackerOptions = {}) {
    this.#baselineFingerprint = baselineFingerprint;
    this.#startedAt = startedAt;
    this.#responseStartTimeoutMs = options.responseStartTimeoutMs ?? 120_000;
    this.#responseStableMs = options.responseStableMs ?? 3_500;
    this.#lastFingerprint = baselineFingerprint;
    this.#lastChangeAt = startedAt;
  }

  observe(snapshot: ChatGptAdapterSnapshot, now: number): ResponseProgress {
    if (snapshot.continueAvailable) {
      this.#observedActivity = true;
      return this.#result('continue_available', snapshot.assistantFingerprint, null);
    }

    if (snapshot.busy || snapshot.assistantFingerprint !== this.#baselineFingerprint) this.#observedActivity = true;
    if (snapshot.assistantFingerprint !== this.#lastFingerprint) {
      this.#lastFingerprint = snapshot.assistantFingerprint;
      this.#lastChangeAt = now;
    }

    if (this.#observedActivity && !snapshot.busy) {
      const stableAt = this.#lastChangeAt + this.#responseStableMs;
      if (now >= stableAt) return this.#result('stable', snapshot.assistantFingerprint, null);
      return this.#result('active', snapshot.assistantFingerprint, stableAt);
    }

    if (!this.#observedActivity) {
      const timeoutAt = this.#startedAt + this.#responseStartTimeoutMs;
      if (now >= timeoutAt) return this.#result('timed_out', snapshot.assistantFingerprint, null);
      return this.#result('waiting_start', snapshot.assistantFingerprint, timeoutAt);
    }

    return this.#result('active', snapshot.assistantFingerprint, null);
  }

  #result(state: ResponseProgress['state'], assistantFingerprint: string, nextDeadlineAt: number | null): ResponseProgress {
    return freezeJsonValue({
      schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
      state,
      observedActivity: this.#observedActivity,
      assistantFingerprint,
      nextDeadlineAt,
    });
  }
}
