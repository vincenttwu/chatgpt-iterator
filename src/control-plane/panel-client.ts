import { ContractError, ERROR_CODES, createRequest, requireMessageEnvelope } from '../core/index.ts';
import type { ControlPlaneInvalidationHint, ControlPlaneSnapshot } from './types.ts';
import { CONTROL_PLANE_OPERATIONS, CONTROL_PLANE_PORT_NAME, CONTROL_PLANE_SCHEMA_VERSION } from './types.ts';

export interface PanelRuntimePortLike {
  readonly name: string;
  disconnect(): void;
  readonly onMessage: { addListener(listener: (message: unknown) => void): void };
  readonly onDisconnect: { addListener(listener: () => void): void };
}
export interface PanelRuntimeLike {
  sendMessage(message: unknown): Promise<unknown>;
  connect(options: { name: string }): PanelRuntimePortLike;
}
export interface PanelConnectionCallbacks {
  readonly onInvalidation: (reason: ControlPlaneInvalidationHint['reason']) => void;
  readonly onStateChange: (state: 'connected' | 'reconnecting' | 'stopped') => void;
}
export interface HydrationOutcome { readonly applied: boolean; readonly snapshot?: ControlPlaneSnapshot; }

function requireInvalidationHint(value: unknown): ControlPlaneInvalidationHint {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'invalidation hint must be an object');
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'invalidate' || candidate.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid invalidation hint');
  if (!Number.isSafeInteger(candidate.sequence) || (candidate.sequence as number) < 1) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid invalidation sequence');
  if (!['connected', 'authority_changed', 'tab_changed', 'run_changed', 'template_changed', 'preset_changed', 'queue_changed', 'settings_changed', 'history_changed', 'runtime_recovered'].includes(String(candidate.reason))) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid invalidation reason');
  return candidate as unknown as ControlPlaneInvalidationHint;
}

function requireSnapshot(value: unknown): ControlPlaneSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'control-plane snapshot must be an object');
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported control-plane snapshot schema');
  if (!Number.isSafeInteger(candidate.requestSequence) || (candidate.requestSequence as number) < 1) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid snapshot request sequence');
  if (!Number.isSafeInteger(candidate.authorityRevision) || (candidate.authorityRevision as number) < 1) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid authority revision');
  if (typeof candidate.generatedAt !== 'string') throw new ContractError(ERROR_CODES.invalidMessage, 'invalid generatedAt');
  return candidate as unknown as ControlPlaneSnapshot;
}

export class SidePanelControlClient {
  readonly #runtime: PanelRuntimeLike;
  #latestHydrateIssued = 0;

  constructor(runtime: PanelRuntimeLike) { this.#runtime = runtime; }

  async hydrate(): Promise<HydrationOutcome> {
    const requestSequence = ++this.#latestHydrateIssued;
    const request = createRequest({
      requestSequence,
      intent: 'query',
      source: 'sidepanel',
      target: 'background',
      operation: CONTROL_PLANE_OPERATIONS.hydrate,
      payload: {},
    });
    const response = requireMessageEnvelope(await this.#runtime.sendMessage(request));
    if (response.kind !== 'response' || response.requestId !== request.requestId || response.operation !== request.operation || response.requestSequence !== requestSequence) {
      throw new ContractError(ERROR_CODES.invalidMessage, 'control-plane response correlation failed');
    }
    if (!response.outcome.ok) throw new ContractError(response.outcome.error.code, response.outcome.error.message, response.outcome.error.details);
    const snapshot = requireSnapshot(response.outcome.value);
    if (snapshot.requestSequence !== requestSequence) throw new ContractError(ERROR_CODES.invalidMessage, 'snapshot request sequence mismatch');
    if (requestSequence !== this.#latestHydrateIssued) return { applied: false };
    return { applied: true, snapshot };
  }

  connect(callbacks: PanelConnectionCallbacks, scheduleReconnect: (callback: () => void) => void = (callback) => setTimeout(callback, 250)): { stop(): void } {
    let stopped = false;
    let port: PanelRuntimePortLike | undefined;
    const open = () => {
      if (stopped) return;
      port = this.#runtime.connect({ name: CONTROL_PLANE_PORT_NAME });
      callbacks.onStateChange('connected');
      port.onMessage.addListener((message) => {
        try { callbacks.onInvalidation(requireInvalidationHint(message).reason); } catch { /* malformed hints are ignored */ }
      });
      port.onDisconnect.addListener(() => {
        if (stopped) return;
        callbacks.onStateChange('reconnecting');
        scheduleReconnect(open);
      });
    };
    open();
    return { stop: () => { stopped = true; port?.disconnect(); callbacks.onStateChange('stopped'); } };
  }
}
