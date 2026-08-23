import { RUN_SHORT_DELAY_THRESHOLD_MS } from './types.ts';

export interface AlarmLike { readonly name: string }
export interface AlarmEventLike { addListener(listener: (alarm: AlarmLike) => void): void }
export interface AlarmBrowserLike {
  create(name: string, info: { readonly when: number }): Promise<void> | void;
  clear(name: string): Promise<boolean> | boolean;
  readonly onAlarm: AlarmEventLike;
}

export interface TimerPort {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const DEFAULT_TIMERS: TimerPort = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

function alarmName(runId: string, generation: number): string { return `chatgpt-iterator:run-delay:${runId}:${generation}`; }

export class DurableRunScheduler {
  readonly #alarms: AlarmBrowserLike;
  readonly #now: () => number;
  readonly #timers: TimerPort;
  readonly #callbacks = new Map<string, () => void>();
  readonly #shortTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(alarms: AlarmBrowserLike, now: () => number = () => Date.now(), timers: TimerPort = DEFAULT_TIMERS) {
    this.#alarms = alarms;
    this.#now = now;
    this.#timers = timers;
    this.#alarms.onAlarm.addListener((alarm) => {
      const callback = this.#callbacks.get(alarm.name);
      if (callback === undefined) return;
      this.#callbacks.delete(alarm.name);
      callback();
    });
  }

  async schedule(runId: string, generation: number, dueAt: string, callback: () => void): Promise<'short_timer' | 'alarm'> {
    await this.cancel(runId);
    const when = Date.parse(dueAt);
    if (Number.isNaN(when)) throw new TypeError('dueAt must be an ISO timestamp');
    const name = alarmName(runId, generation);
    this.#callbacks.set(name, callback);
    const delayMs = Math.max(0, when - this.#now());
    if (delayMs < RUN_SHORT_DELAY_THRESHOLD_MS) {
      const timer = this.#timers.setTimeout(() => {
        this.#shortTimers.delete(name);
        const current = this.#callbacks.get(name);
        this.#callbacks.delete(name);
        current?.();
      }, delayMs);
      this.#shortTimers.set(name, timer);
      return 'short_timer';
    }
    await this.#alarms.create(name, { when });
    return 'alarm';
  }

  async cancel(runId: string): Promise<void> {
    const prefix = `chatgpt-iterator:run-delay:${runId}:`;
    const names = [...this.#callbacks.keys()].filter((name) => name.startsWith(prefix));
    for (const name of names) {
      const timer = this.#shortTimers.get(name);
      if (timer !== undefined) {
        this.#timers.clearTimeout(timer);
        this.#shortTimers.delete(name);
      }
      this.#callbacks.delete(name);
      await this.#alarms.clear(name);
    }
  }
}
