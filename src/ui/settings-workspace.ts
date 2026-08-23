import { ContractError, ERROR_CODES, createRequest, requireMessageEnvelope } from '../core/index.ts';
import type { JsonObject, MessageIntent } from '../core/types.ts';
import { DEFAULT_SETTINGS, requireSettingsSnapshot, requireSettingsWriteInput } from '../settings/model.ts';
import { SETTINGS_RUNTIME_OPERATIONS, type RecoveryPolicy, type SettingsSnapshot } from '../settings/types.ts';
import { DIAGNOSTICS_RUNTIME_OPERATIONS, DIAGNOSTICS_SCHEMA_VERSION, type DiagnosticsSnapshot } from '../diagnostics/types.ts';
import { HISTORY_RUNTIME_OPERATIONS, HISTORY_SCHEMA_VERSION, type HistoryMutationResult, type RunHistorySnapshot } from '../history/types.ts';

export interface SettingsPanelRuntimeLike { sendMessage(message: unknown): Promise<unknown>; }
export interface SettingsDraft {
  defaultPresetId: string | null;
  defaultDelaySeconds: number;
  defaultAutoContinue: boolean;
  defaultAutoScroll: boolean;
  defaultPreventDiscard: boolean;
  recoveryPolicy: RecoveryPolicy;
  historyLimit: number;
}

export function blankSettingsDraft(): SettingsDraft {
  return { defaultPresetId: null, defaultDelaySeconds: DEFAULT_SETTINGS.defaultDelaySeconds, defaultAutoContinue: DEFAULT_SETTINGS.defaultAutoContinue, defaultAutoScroll: DEFAULT_SETTINGS.defaultAutoScroll, defaultPreventDiscard: DEFAULT_SETTINGS.defaultPreventDiscard, recoveryPolicy: DEFAULT_SETTINGS.recoveryPolicy, historyLimit: DEFAULT_SETTINGS.historyLimit };
}

export function settingsDraftFrom(source: SettingsSnapshot): SettingsDraft {
  return {
    defaultPresetId: source.defaultPresetId,
    defaultDelaySeconds: source.defaultDelaySeconds,
    defaultAutoContinue: source.defaultAutoContinue,
    defaultAutoScroll: source.defaultAutoScroll,
    defaultPreventDiscard: source.defaultPreventDiscard,
    recoveryPolicy: source.recoveryPolicy,
    historyLimit: source.historyLimit,
  };
}
export function isSettingsDraftDirty(draft: SettingsDraft, base: SettingsSnapshot | undefined): boolean {
  if (base === undefined) return true;
  return draft.defaultPresetId !== base.defaultPresetId || draft.defaultDelaySeconds !== base.defaultDelaySeconds || draft.defaultAutoContinue !== base.defaultAutoContinue || draft.defaultAutoScroll !== base.defaultAutoScroll || draft.defaultPreventDiscard !== base.defaultPreventDiscard || draft.recoveryPolicy !== base.recoveryPolicy || draft.historyLimit !== base.historyLimit;
}
export function validateSettingsDraft(draft: SettingsDraft): void { requireSettingsWriteInput(draft as unknown as Record<string, unknown>); }

class RuntimeClientBase {
  readonly runtime: SettingsPanelRuntimeLike;
  requestSequence = 0;
  constructor(runtime: SettingsPanelRuntimeLike) { this.runtime = runtime; }
  async request(intent: MessageIntent, operation: string, payload: JsonObject): Promise<unknown> {
    const request = createRequest({ requestSequence: ++this.requestSequence, intent, source: 'sidepanel', target: 'background', operation, payload });
    const response = requireMessageEnvelope(await this.runtime.sendMessage(request));
    if (response.kind !== 'response' || response.requestId !== request.requestId || response.requestSequence !== request.requestSequence || response.operation !== operation) throw new ContractError(ERROR_CODES.invalidMessage, 'settings surface response correlation failed');
    if (!response.outcome.ok) throw new ContractError(response.outcome.error.code, response.outcome.error.message, response.outcome.error.details);
    return response.outcome.value;
  }
}

export class SidePanelSettingsClient extends RuntimeClientBase {
  async get(): Promise<SettingsSnapshot> { return requireSettingsSnapshot(await this.request('query', SETTINGS_RUNTIME_OPERATIONS.get, {})); }
  async update(base: SettingsSnapshot, draft: SettingsDraft): Promise<SettingsSnapshot> {
    validateSettingsDraft(draft);
    return requireSettingsSnapshot(await this.request('command', SETTINGS_RUNTIME_OPERATIONS.update, { expectedRevision: base.revision, ...draft }));
  }
}

function requireDiagnostics(value: unknown): DiagnosticsSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object' || (value as Record<string, unknown>).schemaVersion !== DIAGNOSTICS_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid diagnostics snapshot');
  return value as DiagnosticsSnapshot;
}
function requireHistory(value: unknown): RunHistorySnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object' || (value as Record<string, unknown>).schemaVersion !== HISTORY_SCHEMA_VERSION || !Array.isArray((value as Record<string, unknown>).entries)) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid history snapshot');
  return value as RunHistorySnapshot;
}
function requireHistoryMutation(value: unknown): HistoryMutationResult {
  if (value === null || Array.isArray(value) || typeof value !== 'object' || (value as Record<string, unknown>).schemaVersion !== HISTORY_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid history mutation result');
  return value as HistoryMutationResult;
}

export class SidePanelDiagnosticsClient extends RuntimeClientBase { async get(): Promise<DiagnosticsSnapshot> { return requireDiagnostics(await this.request('query', DIAGNOSTICS_RUNTIME_OPERATIONS.get, {})); } }
export class SidePanelHistoryClient extends RuntimeClientBase {
  async list(): Promise<RunHistorySnapshot> { return requireHistory(await this.request('query', HISTORY_RUNTIME_OPERATIONS.list, {})); }
  async clear(): Promise<HistoryMutationResult> { return requireHistoryMutation(await this.request('command', HISTORY_RUNTIME_OPERATIONS.clear, {})); }
}
