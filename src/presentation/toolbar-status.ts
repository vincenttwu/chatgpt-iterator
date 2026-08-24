import type { ChatGptTabTarget } from '../tabs/types.ts';
import { isRunTerminal, type DurableRunSnapshot } from '../runs/types.ts';
import { projectRunPresentation, type RunPresentationAttentionKey, type RunPresentationLabelKey, type RunPresentationProjection } from './run-projection.ts';

export interface ToolbarStatusCopy {
  readonly appName: string;
  readonly activeRuns: string;
  readonly needsAttention: string;
  readonly currentIteration: string;
  readonly delayRemaining: string;
  readonly pausedDelayRemaining: string;
  readonly responseElapsed: string;
  readonly lifecycle: Readonly<Record<RunPresentationLabelKey, string>>;
  readonly attention: Readonly<Record<Exclude<RunPresentationAttentionKey, null>, string>>;
}

const FALLBACK_LIFECYCLE: Readonly<Record<RunPresentationLabelKey, string>> = Object.freeze({
  runStateReady: 'Ready',
  runStateRunning: 'Running',
  runStateWaitingResponse: 'Waiting for response',
  runStateWaitingDelay: 'Waiting for delay',
  runStatePaused: 'Paused',
  runStateFrozen: 'Tab frozen',
  runStateDiscarded: 'Tab discarded',
  runStateReconnecting: 'Reconnecting target',
  runStateCompleted: 'Completed',
  runStateFailed: 'Failed',
  runStateStopped: 'Stopped',
});

const FALLBACK_ATTENTION: Readonly<Record<Exclude<RunPresentationAttentionKey, null>, string>> = Object.freeze({
  frozenExplanation: 'The target tab is frozen.',
  discardedExplanation: 'The target tab was discarded.',
  targetReconnectExplanation: 'The target page is reconnecting.',
  browserSessionResetExplanation: 'Rebind the intended target after the browser or extension session restarted.',
  conversationChangedExplanation: 'The target moved to a different ChatGPT conversation; explicit rebind is required.',
  failedExplanation: 'The run failed.',
});

export const DEFAULT_TOOLBAR_STATUS_COPY: ToolbarStatusCopy = Object.freeze({
  appName: 'ChatGPT Iterator',
  activeRuns: 'active runs',
  needsAttention: 'need attention',
  currentIteration: 'Iteration',
  delayRemaining: 'Next send in',
  pausedDelayRemaining: 'Paused delay remaining',
  responseElapsed: 'Response wait elapsed',
  lifecycle: FALLBACK_LIFECYCLE,
  attention: FALLBACK_ATTENTION,
});

export function createToolbarStatusCopy(resolve: (key: string, fallback: string) => string): ToolbarStatusCopy {
  const lifecycle = Object.fromEntries(Object.entries(FALLBACK_LIFECYCLE).map(([key, fallback]) => [key, resolve(key, fallback)])) as unknown as Readonly<Record<RunPresentationLabelKey, string>>;
  const attention = Object.fromEntries(Object.entries(FALLBACK_ATTENTION).map(([key, fallback]) => [key, resolve(key, fallback)])) as unknown as Readonly<Record<Exclude<RunPresentationAttentionKey, null>, string>>;
  return Object.freeze({
    appName: resolve('appName', DEFAULT_TOOLBAR_STATUS_COPY.appName),
    activeRuns: resolve('activeRuns', DEFAULT_TOOLBAR_STATUS_COPY.activeRuns),
    needsAttention: resolve('toolbarNeedsAttention', DEFAULT_TOOLBAR_STATUS_COPY.needsAttention),
    currentIteration: resolve('currentIteration', DEFAULT_TOOLBAR_STATUS_COPY.currentIteration),
    delayRemaining: resolve('delayRemaining', DEFAULT_TOOLBAR_STATUS_COPY.delayRemaining),
    pausedDelayRemaining: resolve('pausedDelayRemaining', DEFAULT_TOOLBAR_STATUS_COPY.pausedDelayRemaining),
    responseElapsed: resolve('responseElapsed', DEFAULT_TOOLBAR_STATUS_COPY.responseElapsed),
    lifecycle: Object.freeze(lifecycle),
    attention: Object.freeze(attention),
  });
}

export interface ToolbarActionView {
  readonly badgeText: string;
  readonly title: string;
}

export interface ToolbarTabActionView extends ToolbarActionView {
  readonly tabId: number;
}

export interface ToolbarStatusModel {
  readonly global: ToolbarActionView;
  readonly tabs: readonly ToolbarTabActionView[];
  readonly nextRefreshAt: number|null;
}

export interface ToolbarActionApiLike {
  setBadgeText(details: { readonly text: string; readonly tabId?: number }): Promise<void>|void;
  setTitle(details: { readonly title: string; readonly tabId?: number }): Promise<void>|void;
}

export interface ToolbarStatusProviders {
  runs(): Promise<readonly DurableRunSnapshot[]>;
  targets(): readonly ChatGptTabTarget[];
}

export interface ToolbarStatusControllerOptions {
  readonly copy?: ToolbarStatusCopy;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
  readonly onError?: (error: unknown) => void;
}

function compactCount(count: number): string {
  return count <= 99 ? String(count) : '99+';
}

function compactProgress(value: number, total: number): string {
  const boundedValue = Math.max(0, value);
  const boundedTotal = Math.max(0, total);
  const exact = `${boundedValue}/${boundedTotal}`;
  const percent = boundedTotal === 0 ? 0 : Math.round((boundedValue / boundedTotal) * 100);
  return exact.length <= 4 ? exact : `${Math.max(0, Math.min(100, percent))}%`;
}

function titleForSingle(projection: RunPresentationProjection, copy: ToolbarStatusCopy): string {
  const parts = [copy.appName, copy.lifecycle[projection.labelKey]];
  if (projection.needsAttention) parts.push(projection.attentionKey === null ? copy.needsAttention : copy.attention[projection.attentionKey]);
  if (projection.delayRemainingSeconds !== null) {
    parts.push(`${projection.delayFrozen ? copy.pausedDelayRemaining : copy.delayRemaining} ${projection.delayRemainingSeconds}s`);
  } else if (projection.responseElapsedSeconds !== null) {
    parts.push(`${copy.responseElapsed} ${projection.responseElapsedSeconds}s`);
  }
  if (projection.currentIteration !== null) parts.push(`${copy.currentIteration} ${projection.currentIteration}/${projection.total}`);
  return parts.join(' · ');
}

function badgeForSingle(projection: RunPresentationProjection): string {
  if (projection.needsAttention) return '!';
  if (projection.lifecycleState === 'paused') return 'P';
  const progressValue = projection.lifecycleState === 'waiting_delay'
    ? projection.completed
    : projection.currentIteration ?? projection.completed;
  return compactProgress(progressValue, projection.total);
}

function nextTemporalRefresh(run: DurableRunSnapshot, projection: RunPresentationProjection, now: number): number|null {
  if (projection.lifecycleState === 'waiting_delay' && run.execution.nextDueAt !== null && projection.delayRemainingMs !== null && projection.delayRemainingMs > 0) {
    const dueAt = Date.parse(run.execution.nextDueAt);
    if (!Number.isNaN(dueAt)) {
      const seconds = Math.ceil(projection.delayRemainingMs / 1000);
      const boundary = dueAt - Math.max(0, seconds - 1) * 1000;
      return Math.max(now + 25, boundary + 5);
    }
  }
  if (projection.lifecycleState === 'waiting_response' && run.execution.responseStartedAt !== null && projection.responseElapsedMs !== null) {
    const startedAt = Date.parse(run.execution.responseStartedAt);
    if (!Number.isNaN(startedAt)) {
      const nextSecond = Math.floor(projection.responseElapsedMs / 1000) + 1;
      return Math.max(now + 25, startedAt + nextSecond * 1000 + 5);
    }
  }
  return null;
}

function aggregateView(entries: readonly { readonly run: DurableRunSnapshot; readonly projection: RunPresentationProjection }[], copy: ToolbarStatusCopy): ToolbarActionView {
  if (entries.length === 0) return Object.freeze({ badgeText: '', title: copy.appName });
  if (entries.length === 1) {
    const projection = entries[0]!.projection;
    return Object.freeze({ badgeText: badgeForSingle(projection), title: titleForSingle(projection, copy) });
  }
  const attention = entries.filter((entry) => entry.projection.needsAttention).length;
  const suffix = attention > 0 ? ` · ${attention} ${copy.needsAttention}` : '';
  return Object.freeze({ badgeText: compactCount(entries.length), title: `${copy.appName} · ${entries.length} ${copy.activeRuns}${suffix}` });
}

export function projectToolbarStatus(
  runs: readonly DurableRunSnapshot[],
  targets: readonly ChatGptTabTarget[] = [],
  options: { readonly now?: number; readonly copy?: ToolbarStatusCopy } = {},
): ToolbarStatusModel {
  const now = options.now ?? Date.now();
  const copy = options.copy ?? DEFAULT_TOOLBAR_STATUS_COPY;
  const targetByKey = new Map(targets.map((target) => [`${target.windowId}:${target.tabId}`, target] as const));
  const active = runs
    .filter((run) => !isRunTerminal(run.lifecycleState))
    .map((run) => {
      const target = targetByKey.get(`${run.targetWindowId}:${run.targetTabId}`);
      return { run, projection: projectRunPresentation(run, { now, target }) };
    });

  const byTab = new Map<number, { run: DurableRunSnapshot; projection: RunPresentationProjection }[]>();
  for (const entry of active) {
    const existing = byTab.get(entry.run.targetTabId) ?? [];
    existing.push(entry);
    byTab.set(entry.run.targetTabId, existing);
  }

  const tabs = [...byTab.entries()]
    .sort(([left], [right]) => left - right)
    .map(([tabId, entries]) => Object.freeze({ tabId, ...aggregateView(entries, copy) }));

  let nextRefreshAt: number|null = null;
  for (const entry of active) {
    const candidate = nextTemporalRefresh(entry.run, entry.projection, now);
    if (candidate !== null && (nextRefreshAt === null || candidate < nextRefreshAt)) nextRefreshAt = candidate;
  }

  return Object.freeze({ global: aggregateView(active, copy), tabs: Object.freeze(tabs), nextRefreshAt });
}

export class ToolbarStatusController {
  readonly #action: ToolbarActionApiLike;
  readonly #providers: ToolbarStatusProviders;
  readonly #copy: ToolbarStatusCopy;
  readonly #now: () => number;
  readonly #schedule: (callback: () => void, delayMs: number) => unknown;
  readonly #cancel: (handle: unknown) => void;
  readonly #onError: ((error: unknown) => void)|undefined;
  #timer: unknown = undefined;
  #generation = 0;
  #knownTabs = new Set<number>();
  #refreshTail: Promise<void> = Promise.resolve();

  constructor(action: ToolbarActionApiLike, providers: ToolbarStatusProviders, options: ToolbarStatusControllerOptions = {}) {
    this.#action = action;
    this.#providers = providers;
    this.#copy = options.copy ?? DEFAULT_TOOLBAR_STATUS_COPY;
    this.#now = options.now ?? Date.now;
    this.#schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.#onError = options.onError;
  }

  #clearTimer(): void {
    if (this.#timer === undefined) return;
    this.#cancel(this.#timer);
    this.#timer = undefined;
  }

  async #write(operation: () => Promise<void>|void): Promise<void> {
    try { await operation(); } catch (error) { this.#onError?.(error); }
  }

  async #refreshGeneration(generation: number): Promise<void> {
    if (generation !== this.#generation) return;
    const runs = await this.#providers.runs();
    if (generation !== this.#generation) return;
    const now = this.#now();
    const model = projectToolbarStatus(runs, this.#providers.targets(), { now, copy: this.#copy });
    await this.#write(() => this.#action.setBadgeText({ text: model.global.badgeText }));
    await this.#write(() => this.#action.setTitle({ title: model.global.title }));

    const nextTabs = new Set(model.tabs.map((entry) => entry.tabId));
    for (const tabId of this.#knownTabs) {
      if (nextTabs.has(tabId)) continue;
      await this.#write(() => this.#action.setBadgeText({ text: '', tabId }));
      await this.#write(() => this.#action.setTitle({ title: this.#copy.appName, tabId }));
    }
    for (const entry of model.tabs) {
      await this.#write(() => this.#action.setBadgeText({ text: entry.badgeText, tabId: entry.tabId }));
      await this.#write(() => this.#action.setTitle({ title: entry.title, tabId: entry.tabId }));
    }
    this.#knownTabs = nextTabs;

    if (generation !== this.#generation || model.nextRefreshAt === null) return;
    const delayMs = Math.max(25, model.nextRefreshAt - this.#now());
    this.#timer = this.#schedule(() => { this.#timer = undefined; void this.refresh(); }, delayMs);
  }

  refresh(): Promise<void> {
    const generation = ++this.#generation;
    this.#clearTimer();
    const task = this.#refreshTail.then(async () => { await this.#refreshGeneration(generation); });
    this.#refreshTail = task.catch(() => undefined);
    return task;
  }

  dispose(): void {
    this.#generation += 1;
    this.#clearTimer();
  }
}
