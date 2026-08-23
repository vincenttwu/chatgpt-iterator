import type { JsonObject } from '../core/types.ts';
import type { RunMode, RunTerminalState } from '../runs/types.ts';

export const HISTORY_SCHEMA_VERSION = 1 as const;
export const HISTORY_RUNTIME_OPERATIONS = Object.freeze({
  list: 'history.list',
  clear: 'history.clear',
} as const);

export interface RunHistoryEntry extends JsonObject {
  readonly schemaVersion: number;
  readonly id: string;
  readonly lifecycleState: RunTerminalState;
  readonly mode: RunMode;
  readonly targetTabId: number;
  readonly targetWindowId: number;
  readonly completedIterations: number;
  readonly totalIterations: number;
  readonly failureCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RunHistorySnapshot extends JsonObject {
  readonly schemaVersion: number;
  readonly limit: number;
  readonly totalRetained: number;
  readonly entries: RunHistoryEntry[];
}

export interface HistoryMutationResult extends JsonObject {
  readonly schemaVersion: number;
  readonly removedRuns: number;
  readonly removedEvents: number;
}
