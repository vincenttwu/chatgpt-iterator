import type { JsonObject } from '../core/types.ts';

export const RUN_STATE_SCHEMA_VERSION = 1 as const;
export const RUN_EVENT_SCHEMA_VERSION = 1 as const;
export const RUN_EVENT_HISTORY_LIMIT = 256 as const;
export const RUN_RESPONSE_START_TIMEOUT_MS = 120_000 as const;
export const RUN_RESPONSE_STABLE_MS = 3_500 as const;
export const RUN_SHORT_DELAY_THRESHOLD_MS = 30_000 as const;

export const RUN_RUNTIME_OPERATIONS = Object.freeze({
  create: 'run.create', start: 'run.start', get: 'run.get', list: 'run.list', pause: 'run.pause', resume: 'run.resume', stop: 'run.stop',
} as const);

export type RunLifecycleState = 'ready'|'running'|'waiting_response'|'waiting_delay'|'paused'|'frozen'|'discarded'|'completed'|'failed'|'stopped';
export type RunActiveState = 'running'|'waiting_response'|'waiting_delay';
export type RunSuspendedState = 'paused'|'frozen'|'discarded';
export type RunTerminalState = 'completed'|'failed'|'stopped';
export type RunMode = 'repeat'|'queue';

export interface RunFailure extends JsonObject { readonly code: string; readonly message: string; }

export interface RunExecutionCommon extends JsonObject {
  readonly mode: RunMode;
  readonly totalIterations: number;
  readonly completedIterations: number;
  readonly activeIteration: number|null;
  readonly activeMessage: string|null;
  readonly activeDelayAfterSeconds: number|null;
  readonly delaySeconds: number;
  readonly autoContinue: boolean;
  readonly autoScroll: boolean;
  readonly preventDiscard: boolean;
  readonly assistantBaselineSignature: string|null;
  readonly nextDueAt: string|null;
}

export interface RepeatRunState extends RunExecutionCommon {
  readonly mode: 'repeat';
  readonly messageTemplate: string;
}

export interface QueueRunItem extends JsonObject {
  readonly id: string;
  readonly position: number;
  readonly source: 'literal'|'template';
  readonly templateId: string|null;
  readonly templateRevision: number|null;
  readonly content: string;
  readonly delayAfterSeconds: number|null;
}

export interface QueueRunState extends RunExecutionCommon {
  readonly mode: 'queue';
  readonly queueId: string;
  readonly queueRevision: number;
  readonly items: QueueRunItem[];
}

export type RunExecutionState = RepeatRunState|QueueRunState;

export interface DurableRunSnapshot extends JsonObject {
  readonly schemaVersion: number;
  readonly id: string;
  readonly generation: number;
  readonly lifecycleState: RunLifecycleState;
  readonly targetTabId: number;
  readonly targetWindowId: number;
  readonly resumeState: RunActiveState|null;
  readonly failure: RunFailure|null;
  readonly execution: RunExecutionState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type RunEventType = 'created'|'started'|'state_changed'|'iteration_prepared'|'iteration_completed'|'delay_elapsed'|'paused'|'resumed'|'stopped'|'completed'|'failed'|'tab_suspended'|'tab_recovered'|'worker_recovered';
export interface RunTransitionCommand { readonly runId:string; readonly expectedGeneration:number; readonly commandId:string; }
export function isRunTerminal(state: RunLifecycleState): state is RunTerminalState { return state==='completed'||state==='failed'||state==='stopped'; }
export function isRunActive(state: RunLifecycleState): state is RunActiveState { return state==='running'||state==='waiting_response'||state==='waiting_delay'; }
