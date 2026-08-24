import { ContractError, ERROR_CODES, createRequest, freezeJsonValue, requireMessageEnvelope } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import { isRunTerminal, type DurableRunSnapshot } from '../runs/types.ts';
import type { ChatGptTabTarget } from '../tabs/types.ts';
import {
  DEFAULT_INPAGE_CONTROLLER_DOCK,
  isInPageControllerDock,
  type InPageControllerDock,
} from './inpage-placement.ts';
import { projectRunPresentation, type RunPresentationProjection } from './run-projection.ts';

export const INPAGE_CONTROLLER_SCHEMA_VERSION = 1 as const;
export const INPAGE_CONTROLLER_STORAGE_KEY = 'inpageController.v1' as const;
export const INPAGE_CONTROLLER_INVALIDATION_KIND = 'inpage_controller_invalidate' as const;

export const INPAGE_CONTROLLER_OPERATIONS = Object.freeze({
  status: 'inpage.status',
  pause: 'inpage.pause',
  resume: 'inpage.resume',
  stop: 'inpage.stop',
  openPanel: 'inpage.openpanel',
  setCollapsed: 'inpage.setcollapsed',
  setDock: 'inpage.setdock',
} as const);

export type InPageControllerOperation = (typeof INPAGE_CONTROLLER_OPERATIONS)[keyof typeof INPAGE_CONTROLLER_OPERATIONS];
export type InPageControllerState = 'idle'|'single'|'multiple';

export interface InPageControllerSnapshot extends JsonObject {
  readonly schemaVersion: number;
  readonly projectedAt: string;
  readonly collapsed: boolean;
  readonly dock: InPageControllerDock;
  readonly state: InPageControllerState;
  readonly activeRunCount: number;
  readonly runId: string|null;
  readonly generation: number|null;
  readonly projection: RunPresentationProjection|null;
}

export interface InPageControllerPreference extends JsonObject {
  readonly schemaVersion: number;
  readonly collapsed: boolean;
  readonly dock: InPageControllerDock;
}

export interface InPageControllerInvalidation extends JsonObject {
  readonly kind: typeof INPAGE_CONTROLLER_INVALIDATION_KIND;
  readonly schemaVersion: number;
}

export const INPAGE_CONTROLLER_INVALIDATION: InPageControllerInvalidation = freezeJsonValue({
  kind: INPAGE_CONTROLLER_INVALIDATION_KIND,
  schemaVersion: INPAGE_CONTROLLER_SCHEMA_VERSION,
});

export function isInPageControllerInvalidation(value: unknown): value is InPageControllerInvalidation {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === INPAGE_CONTROLLER_INVALIDATION_KIND && candidate.schemaVersion === INPAGE_CONTROLLER_SCHEMA_VERSION;
}

export function requireInPageControllerPreference(value: unknown): InPageControllerPreference {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'in-page controller preference must be an object');
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== INPAGE_CONTROLLER_SCHEMA_VERSION || typeof candidate.collapsed !== 'boolean') {
    throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported in-page controller preference');
  }
  if (candidate.dock !== undefined && !isInPageControllerDock(candidate.dock)) throw new ContractError(ERROR_CODES.invalidMessage, 'in-page controller dock is invalid');
  return freezeJsonValue({ schemaVersion:INPAGE_CONTROLLER_SCHEMA_VERSION, collapsed:candidate.collapsed, dock:candidate.dock ?? DEFAULT_INPAGE_CONTROLLER_DOCK });
}

export function defaultInPageControllerPreference(): InPageControllerPreference {
  return freezeJsonValue({ schemaVersion:INPAGE_CONTROLLER_SCHEMA_VERSION, collapsed:true, dock:DEFAULT_INPAGE_CONTROLLER_DOCK });
}

function normalizeProjectionPreference(value: boolean|InPageControllerPreference): InPageControllerPreference {
  return typeof value === 'boolean'
    ? freezeJsonValue({ schemaVersion:INPAGE_CONTROLLER_SCHEMA_VERSION, collapsed:value, dock:DEFAULT_INPAGE_CONTROLLER_DOCK })
    : value;
}

export function projectInPageControllerStatus(
  runs: readonly DurableRunSnapshot[],
  target: ChatGptTabTarget|undefined,
  preferenceOrCollapsed: boolean|InPageControllerPreference,
  now: number = Date.now(),
): InPageControllerSnapshot {
  const preference = normalizeProjectionPreference(preferenceOrCollapsed);
  if (target === undefined) {
    return freezeJsonValue({
      schemaVersion:INPAGE_CONTROLLER_SCHEMA_VERSION,
      projectedAt:new Date(now).toISOString(),
      collapsed:preference.collapsed,
      dock:preference.dock,
      state:'idle' as const,
      activeRunCount:0,
      runId:null,
      generation:null,
      projection:null,
    });
  }
  const relevant = runs.filter((run) => !isRunTerminal(run.lifecycleState) && run.targetTabId === target.tabId && run.targetWindowId === target.windowId);
  if (relevant.length !== 1) {
    return freezeJsonValue({
      schemaVersion:INPAGE_CONTROLLER_SCHEMA_VERSION,
      projectedAt:new Date(now).toISOString(),
      collapsed:preference.collapsed,
      dock:preference.dock,
      state:relevant.length === 0 ? 'idle' as const : 'multiple' as const,
      activeRunCount:relevant.length,
      runId:null,
      generation:null,
      projection:null,
    });
  }
  const run = relevant[0]!;
  return freezeJsonValue({
    schemaVersion:INPAGE_CONTROLLER_SCHEMA_VERSION,
    projectedAt:new Date(now).toISOString(),
    collapsed:preference.collapsed,
    dock:preference.dock,
    state:'single' as const,
    activeRunCount:1,
    runId:run.id,
    generation:run.generation,
    projection:projectRunPresentation(run, { now, target }),
  });
}

export function advanceInPageControllerTemporal(snapshot: InPageControllerSnapshot, now: number = Date.now()): InPageControllerSnapshot {
  if (snapshot.state !== 'single' || snapshot.projection === null) return snapshot;
  const projectedAt = Date.parse(snapshot.projectedAt);
  if (Number.isNaN(projectedAt)) return snapshot;
  const elapsed = Math.max(0, now - projectedAt);
  const projection = snapshot.projection;
  const delayRemainingMs = projection.delayRemainingMs === null || projection.delayFrozen ? projection.delayRemainingMs : Math.max(0, projection.delayRemainingMs - elapsed);
  const responseElapsedMs = projection.responseElapsedMs === null || !projection.responseIndeterminate ? projection.responseElapsedMs : projection.responseElapsedMs + elapsed;
  return freezeJsonValue({
    ...snapshot,
    projection:{
      ...projection,
      delayRemainingMs,
      delayRemainingSeconds:delayRemainingMs === null ? null : Math.ceil(delayRemainingMs / 1000),
      responseElapsedMs,
      responseElapsedSeconds:responseElapsedMs === null ? null : Math.floor(responseElapsedMs / 1000),
    },
  });
}

export function nextInPageTemporalRefreshDelay(snapshot: InPageControllerSnapshot, now: number = Date.now()): number|null {
  const current = advanceInPageControllerTemporal(snapshot, now);
  const projection = current.projection;
  if (projection === null) return null;
  if (projection.delayRemainingMs !== null && !projection.delayFrozen && projection.delayRemainingMs > 0) {
    const seconds = Math.ceil(projection.delayRemainingMs / 1000);
    return Math.max(25, projection.delayRemainingMs - Math.max(0, seconds - 1) * 1000 + 5);
  }
  if (projection.responseElapsedMs !== null && projection.responseIndeterminate) {
    return Math.max(25, 1000 - (projection.responseElapsedMs % 1000) + 5);
  }
  return null;
}

export interface InPageRuntimeLike { sendMessage(message: unknown): Promise<unknown>; }

export class InPageControllerClient {
  readonly #runtime: InPageRuntimeLike;
  #sequence = 0;
  constructor(runtime: InPageRuntimeLike) { this.#runtime = runtime; }

  async #request(operation: InPageControllerOperation, intent: 'query'|'command', payload: JsonObject): Promise<unknown> {
    const request = createRequest({ requestSequence:++this.#sequence, intent, source:'content', target:'background', operation, payload });
    const raw = await this.#runtime.sendMessage(request);
    const response = requireMessageEnvelope(raw);
    if (response.kind !== 'response' || response.requestId !== request.requestId || response.operation !== request.operation || response.requestSequence !== request.requestSequence) {
      throw new ContractError(ERROR_CODES.invalidMessage, 'in-page controller response correlation failed');
    }
    if (!response.outcome.ok) throw new ContractError(response.outcome.error.code, response.outcome.error.message, response.outcome.error.details);
    return response.outcome.value;
  }

  async status(): Promise<InPageControllerSnapshot> { return requireInPageControllerSnapshot(await this.#request(INPAGE_CONTROLLER_OPERATIONS.status, 'query', {})); }
  async setCollapsed(collapsed: boolean): Promise<InPageControllerSnapshot> { return requireInPageControllerSnapshot(await this.#request(INPAGE_CONTROLLER_OPERATIONS.setCollapsed, 'command', { collapsed })); }
  async setDock(dock: InPageControllerDock): Promise<InPageControllerSnapshot> { return requireInPageControllerSnapshot(await this.#request(INPAGE_CONTROLLER_OPERATIONS.setDock, 'command', { dock })); }
  async pause(runId: string, expectedGeneration: number): Promise<InPageControllerSnapshot> { return requireInPageControllerSnapshot(await this.#request(INPAGE_CONTROLLER_OPERATIONS.pause, 'command', { runId, expectedGeneration })); }
  async resume(runId: string, expectedGeneration: number): Promise<InPageControllerSnapshot> { return requireInPageControllerSnapshot(await this.#request(INPAGE_CONTROLLER_OPERATIONS.resume, 'command', { runId, expectedGeneration })); }
  async stop(runId: string, expectedGeneration: number): Promise<InPageControllerSnapshot> { return requireInPageControllerSnapshot(await this.#request(INPAGE_CONTROLLER_OPERATIONS.stop, 'command', { runId, expectedGeneration })); }
  async openPanel(): Promise<void> { await this.#request(INPAGE_CONTROLLER_OPERATIONS.openPanel, 'command', {}); }
}

export function requireInPageControllerSnapshot(value: unknown): InPageControllerSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'in-page controller snapshot must be an object');
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== INPAGE_CONTROLLER_SCHEMA_VERSION) throw new ContractError(ERROR_CODES.unsupportedSchema, 'unsupported in-page controller snapshot');
  if (typeof candidate.projectedAt !== 'string' || Number.isNaN(Date.parse(candidate.projectedAt))) throw new ContractError(ERROR_CODES.invalidMessage, 'in-page projectedAt is invalid');
  if (typeof candidate.collapsed !== 'boolean') throw new ContractError(ERROR_CODES.invalidMessage, 'in-page collapsed flag is invalid');
  const dock = candidate.dock === undefined ? DEFAULT_INPAGE_CONTROLLER_DOCK : candidate.dock;
  if (!isInPageControllerDock(dock)) throw new ContractError(ERROR_CODES.invalidMessage, 'in-page controller dock is invalid');
  if (candidate.state !== 'idle' && candidate.state !== 'single' && candidate.state !== 'multiple') throw new ContractError(ERROR_CODES.invalidMessage, 'in-page controller state is invalid');
  if (!Number.isSafeInteger(candidate.activeRunCount) || (candidate.activeRunCount as number) < 0) throw new ContractError(ERROR_CODES.invalidMessage, 'in-page activeRunCount is invalid');
  if (candidate.state === 'single') {
    if (typeof candidate.runId !== 'string' || !Number.isSafeInteger(candidate.generation) || (candidate.generation as number) < 1 || candidate.projection === null || typeof candidate.projection !== 'object') {
      throw new ContractError(ERROR_CODES.invalidMessage, 'single-run in-page snapshot is incomplete');
    }
  } else if (candidate.runId !== null || candidate.generation !== null || candidate.projection !== null) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'non-single in-page snapshot must not expose run control identity');
  }
  return freezeJsonValue({ ...candidate, dock } as unknown as InPageControllerSnapshot);
}
