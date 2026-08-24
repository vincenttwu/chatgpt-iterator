import type { ChatGptTabTarget } from '../tabs/types.ts';
import { isConversationCompatible } from '../runs/conversation.ts';
import { isRunTerminal, type DurableRunSnapshot, type RunLifecycleState } from '../runs/types.ts';

export type RunPresentationTone = 'neutral'|'active'|'waiting'|'paused'|'attention'|'success'|'error';
export type RunPresentationLabelKey =
  'runStateReady'|'runStateRunning'|'runStateWaitingResponse'|'runStateWaitingDelay'|'runStatePaused'|'runStateFrozen'|'runStateDiscarded'|'runStateReconnecting'|'runStateCompleted'|'runStateFailed'|'runStateStopped';
export type RunPresentationAttentionKey =
  'frozenExplanation'|'discardedExplanation'|'targetReconnectExplanation'|'browserSessionResetExplanation'|'conversationChangedExplanation'|'failedExplanation'|null;

export interface RunPresentationActions {
  readonly start: boolean;
  readonly pause: boolean;
  readonly resume: boolean;
  readonly rebind: boolean;
  readonly stop: boolean;
}

export interface RunPresentationProjection {
  readonly lifecycleState: RunLifecycleState;
  readonly labelKey: RunPresentationLabelKey;
  readonly tone: RunPresentationTone;
  readonly completed: number;
  readonly total: number;
  readonly currentIteration: number|null;
  readonly percent: number;
  readonly delayRemainingMs: number|null;
  readonly delayRemainingSeconds: number|null;
  readonly delayFrozen: boolean;
  readonly responseElapsedMs: number|null;
  readonly responseElapsedSeconds: number|null;
  readonly responseIndeterminate: boolean;
  readonly requiresRebind: boolean;
  readonly needsAttention: boolean;
  readonly attentionKey: RunPresentationAttentionKey;
  readonly actions: RunPresentationActions;
}

const LABELS: Readonly<Record<RunLifecycleState, RunPresentationLabelKey>> = Object.freeze({
  ready:'runStateReady', running:'runStateRunning', waiting_response:'runStateWaitingResponse', waiting_delay:'runStateWaitingDelay', paused:'runStatePaused',
  frozen:'runStateFrozen', discarded:'runStateDiscarded', reconnecting:'runStateReconnecting', completed:'runStateCompleted', failed:'runStateFailed', stopped:'runStateStopped',
});

const BASE_TONES: Readonly<Record<RunLifecycleState, RunPresentationTone>> = Object.freeze({
  ready:'neutral', running:'active', waiting_response:'active', waiting_delay:'waiting', paused:'paused', frozen:'attention', discarded:'attention', reconnecting:'attention', completed:'success', failed:'error', stopped:'neutral',
});

function boundedElapsed(nowMs: number, startedAt: string|null): number|null {
  if (startedAt === null) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  return Math.max(0, nowMs - start);
}

function delayRemaining(run: DurableRunSnapshot, nowMs: number): { readonly ms:number|null; readonly frozen:boolean } {
  if (run.lifecycleState === 'waiting_delay' && run.execution.nextDueAt !== null) {
    return { ms: Math.max(0, Date.parse(run.execution.nextDueAt) - nowMs), frozen:false };
  }
  if (run.lifecycleState === 'paused' && run.resumeState === 'waiting_delay' && run.execution.remainingDelayMs !== null) {
    return { ms: run.execution.remainingDelayMs, frozen:true };
  }
  return { ms:null, frozen:false };
}

function attentionKey(run: DurableRunSnapshot): RunPresentationAttentionKey {
  if (run.lifecycleState === 'frozen') return 'frozenExplanation';
  if (run.lifecycleState === 'discarded') return 'discardedExplanation';
  if (run.lifecycleState === 'reconnecting') return 'targetReconnectExplanation';
  if (run.lifecycleState === 'paused' && run.suspensionReason === 'browser_session_reset') return 'browserSessionResetExplanation';
  if (run.lifecycleState === 'paused' && run.suspensionReason === 'conversation_changed') return 'conversationChangedExplanation';
  if (run.lifecycleState === 'failed') return 'failedExplanation';
  return null;
}

export function projectRunPresentation(run: DurableRunSnapshot, options: { readonly now?: number; readonly target?: ChatGptTabTarget } = {}): RunPresentationProjection {
  const nowMs = options.now ?? Date.now();
  const target = options.target;
  const requiresRebind = run.lifecycleState === 'paused' && (run.suspensionReason === 'browser_session_reset' || run.suspensionReason === 'conversation_changed');
  const targetAttention = target !== undefined && (target.tabId !== run.targetTabId || target.windowId !== run.targetWindowId || !isConversationCompatible(run.conversationBinding, target.conversation) || (target.lifecycleState !== 'ready' && target.lifecycleState !== 'degraded'));
  const key = attentionKey(run);
  const delay = delayRemaining(run, nowMs);
  const responsePending = run.lifecycleState === 'waiting_response' || run.resumeState === 'waiting_response';
  const responseElapsedMs = responsePending ? boundedElapsed(nowMs, run.execution.responseStartedAt) : null;
  const total = run.execution.totalIterations;
  const completed = run.execution.completedIterations;
  const currentIteration = run.execution.activeIteration ?? (isRunTerminal(run.lifecycleState) ? null : Math.min(completed + 1, total));
  const actions: RunPresentationActions = Object.freeze({
    start: run.lifecycleState === 'ready',
    pause: run.lifecycleState === 'running' || run.lifecycleState === 'waiting_response' || run.lifecycleState === 'waiting_delay' || run.lifecycleState === 'frozen' || run.lifecycleState === 'discarded' || run.lifecycleState === 'reconnecting',
    resume: run.lifecycleState === 'paused' && !requiresRebind,
    rebind: requiresRebind,
    stop: !isRunTerminal(run.lifecycleState),
  });
  const needsAttention = key !== null || targetAttention;
  const tone: RunPresentationTone = needsAttention && BASE_TONES[run.lifecycleState] !== 'error' ? 'attention' : BASE_TONES[run.lifecycleState];
  return Object.freeze({
    lifecycleState:run.lifecycleState,
    labelKey:LABELS[run.lifecycleState],
    tone,
    completed,
    total,
    currentIteration,
    percent:total === 0 ? 0 : Math.round((completed / total) * 100),
    delayRemainingMs:delay.ms,
    delayRemainingSeconds:delay.ms === null ? null : Math.ceil(delay.ms / 1000),
    delayFrozen:delay.frozen,
    responseElapsedMs,
    responseElapsedSeconds:responseElapsedMs === null ? null : Math.floor(responseElapsedMs / 1000),
    responseIndeterminate:run.lifecycleState === 'waiting_response',
    requiresRebind,
    needsAttention,
    attentionKey:key,
    actions,
  });
}

export const RUN_PRESENTATION_TONES: readonly RunPresentationTone[] = Object.freeze(['neutral','active','waiting','paused','attention','success','error']);
