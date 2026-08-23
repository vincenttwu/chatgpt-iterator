import type { JsonObject, JsonValue } from '../core/types.ts';
import type { ChatGptAdapterStatus, SelectorHealth } from '../chatgpt/types.ts';
import type { ChatGptTabLifecycleState } from '../tabs/types.ts';

export const DIAGNOSTICS_SCHEMA_VERSION = 1 as const;
export const DIAGNOSTICS_RUNTIME_OPERATIONS = Object.freeze({ get: 'diagnostics.get' } as const);

export interface AdapterDiagnosticsProjection extends JsonObject {
  readonly targetTabId: number | null;
  readonly status: ChatGptAdapterStatus | 'not_bound' | 'unreachable';
  readonly capabilities: SelectorHealth[];
  readonly pageAlert: string | null;
}

export interface RuntimeDiagnostics extends JsonObject {
  readonly state: 'ready';
  readonly appVersion: string;
  readonly workerStartedAt: string;
  readonly connectedPanels: number;
  readonly activeRuns: number;
  readonly terminalRuns: number;
}

export interface TabDiagnostics extends JsonObject {
  readonly eligibleTargets: number;
  readonly boundTabId: number | null;
  readonly boundLifecycle: ChatGptTabLifecycleState | null;
}

export interface DatabaseDiagnostics extends JsonObject {
  readonly physicalDbVersion: number;
  readonly logicalModelVersion: number;
  readonly exportFormatVersion: number;
  readonly migrationState: JsonValue | null;
}

export interface StorageTierDiagnostics extends JsonObject {
  readonly tier: 'local' | 'session' | 'sync';
  readonly purpose: string;
}

export interface DataInventory extends JsonObject {
  readonly templates: number;
  readonly presets: number;
  readonly queues: number;
  readonly queueItems: number;
  readonly runs: number;
  readonly runEvents: number;
}

export interface DiagnosticsSnapshot extends JsonObject {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly runtime: RuntimeDiagnostics;
  readonly tabs: TabDiagnostics;
  readonly adapter: AdapterDiagnosticsProjection;
  readonly database: DatabaseDiagnostics;
  readonly storage: StorageTierDiagnostics[];
  readonly data: DataInventory;
  readonly appearance: { readonly mode: 'system'; readonly source: 'system-colors' };
}
