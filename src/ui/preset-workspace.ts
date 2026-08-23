import { ContractError, ERROR_CODES, createRequest, requireMessageEnvelope } from '../core/index.ts';
import type { JsonObject, MessageIntent } from '../core/types.ts';
import { DEFAULT_REPEAT_DELAY_SECONDS, DEFAULT_REPEAT_ITERATIONS } from '../runs/model.ts';
import { requirePresetWriteInput } from '../presets/model.ts';
import {
  PRESET_RUNTIME_OPERATIONS,
  type PresetHydration,
  type PresetMode,
  type PresetReferenceCatalog,
  type PresetSnapshot,
} from '../presets/types.ts';

export interface PresetPanelRuntimeLike { sendMessage(message: unknown): Promise<unknown>; }

export interface PresetDraft {
  readonly sourceId: string | null;
  readonly sourceRevision: number | null;
  name: string;
  mode: PresetMode;
  templateId: string | null;
  queueId: string | null;
  iterationCount: number;
  delaySeconds: number;
  autoContinue: boolean;
  autoScroll: boolean;
  preventDiscard: boolean;
}

export interface RepeatRunWorkingCopy {
  readonly presetId: string;
  readonly presetRevision: number;
  readonly messageTemplate: string;
  readonly totalIterations: number;
  readonly delaySeconds: number;
  readonly autoContinue: boolean;
  readonly autoScroll: boolean;
  readonly preventDiscard: boolean;
}

export function blankPresetDraft(): PresetDraft {
  return {
    sourceId: null,
    sourceRevision: null,
    name: '',
    mode: 'repeat',
    templateId: null,
    queueId: null,
    iterationCount: DEFAULT_REPEAT_ITERATIONS,
    delaySeconds: DEFAULT_REPEAT_DELAY_SECONDS,
    autoContinue: true,
    autoScroll: true,
    preventDiscard: true,
  };
}

export function presetDraftFrom(source: PresetSnapshot): PresetDraft {
  return {
    sourceId: source.id,
    sourceRevision: source.revision,
    name: source.name,
    mode: source.mode,
    templateId: source.templateId,
    queueId: source.queueId,
    iterationCount: source.iterationCount,
    delaySeconds: source.delaySeconds,
    autoContinue: source.autoContinue,
    autoScroll: source.autoScroll,
    preventDiscard: source.preventDiscard,
  };
}

export function isPresetDraftDirty(draft: PresetDraft, base: PresetSnapshot | undefined): boolean {
  if (base === undefined) {
    const blank = blankPresetDraft();
    return draft.name.trim().length > 0
      || draft.mode !== blank.mode
      || draft.templateId !== blank.templateId
      || draft.queueId !== blank.queueId
      || draft.iterationCount !== blank.iterationCount
      || draft.delaySeconds !== blank.delaySeconds
      || draft.autoContinue !== blank.autoContinue
      || draft.autoScroll !== blank.autoScroll
      || draft.preventDiscard !== blank.preventDiscard;
  }
  return draft.name !== base.name
    || draft.mode !== base.mode
    || draft.templateId !== base.templateId
    || draft.queueId !== base.queueId
    || draft.iterationCount !== base.iterationCount
    || draft.delaySeconds !== base.delaySeconds
    || draft.autoContinue !== base.autoContinue
    || draft.autoScroll !== base.autoScroll
    || draft.preventDiscard !== base.preventDiscard;
}

export function isPresetDraftStale(draft: PresetDraft, latest: PresetSnapshot | undefined): boolean {
  if (draft.sourceId === null || draft.sourceRevision === null) return false;
  return latest === undefined || latest.id !== draft.sourceId || latest.revision !== draft.sourceRevision;
}

export function normalizePresetDraftMode(draft: PresetDraft): void {
  if (draft.mode === 'repeat') draft.queueId = null;
  else { draft.templateId = null; draft.iterationCount = 1; }
}

export function validatePresetDraft(draft: PresetDraft): void {
  requirePresetWriteInput({
    name: draft.name,
    mode: draft.mode,
    templateId: draft.templateId,
    queueId: draft.queueId,
    iterationCount: draft.iterationCount,
    delaySeconds: draft.delaySeconds,
    autoContinue: draft.autoContinue,
    autoScroll: draft.autoScroll,
    preventDiscard: draft.preventDiscard,
  });
}

export function repeatRunWorkingCopyFromPreset(hydration: PresetHydration): RepeatRunWorkingCopy {
  if (hydration.mode !== 'repeat') throw new ContractError(ERROR_CODES.unsupportedOperation, 'queue preset execution arrives in STEP-12');
  return Object.freeze({
    presetId: hydration.preset.id,
    presetRevision: hydration.preset.revision,
    messageTemplate: hydration.messageTemplate,
    totalIterations: hydration.totalIterations,
    delaySeconds: hydration.delaySeconds,
    autoContinue: hydration.autoContinue,
    autoScroll: hydration.autoScroll,
    preventDiscard: hydration.preventDiscard,
  });
}

function requirePreset(value: unknown): PresetSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'preset response must be an object');
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || typeof candidate.id !== 'string' || !Number.isSafeInteger(candidate.revision)) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'invalid preset response');
  }
  return candidate as unknown as PresetSnapshot;
}

function requirePresetList(value: unknown): PresetSnapshot[] {
  if (!Array.isArray(value)) throw new ContractError(ERROR_CODES.invalidMessage, 'preset list response must be an array');
  return value.map(requirePreset);
}

function requireReferenceCatalog(value: unknown): PresetReferenceCatalog {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'preset reference catalog must be an object');
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.templates) || !Array.isArray(candidate.queues)) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid preset reference catalog');
  return candidate as unknown as PresetReferenceCatalog;
}

function requireHydration(value: unknown): PresetHydration {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'preset hydration must be an object');
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || (candidate.mode !== 'repeat' && candidate.mode !== 'queue')) throw new ContractError(ERROR_CODES.invalidMessage, 'invalid preset hydration');
  return candidate as unknown as PresetHydration;
}

function inputFromDraft(draft: PresetDraft): JsonObject {
  validatePresetDraft(draft);
  return {
    name: draft.name,
    mode: draft.mode,
    templateId: draft.templateId,
    queueId: draft.queueId,
    iterationCount: draft.iterationCount,
    delaySeconds: draft.delaySeconds,
    autoContinue: draft.autoContinue,
    autoScroll: draft.autoScroll,
    preventDiscard: draft.preventDiscard,
  };
}

export class SidePanelPresetClient {
  readonly #runtime: PresetPanelRuntimeLike;
  #requestSequence = 0;
  constructor(runtime: PresetPanelRuntimeLike) { this.#runtime = runtime; }

  async list(): Promise<PresetSnapshot[]> { return requirePresetList(await this.#request('query', PRESET_RUNTIME_OPERATIONS.list, {})); }
  async references(): Promise<PresetReferenceCatalog> { return requireReferenceCatalog(await this.#request('query', PRESET_RUNTIME_OPERATIONS.references, {})); }
  async hydrate(presetId: string): Promise<PresetHydration> { return requireHydration(await this.#request('query', PRESET_RUNTIME_OPERATIONS.hydrate, { presetId })); }

  async create(draft: PresetDraft): Promise<PresetSnapshot> {
    return requirePreset(await this.#request('command', PRESET_RUNTIME_OPERATIONS.create, inputFromDraft(draft)));
  }

  async update(draft: PresetDraft): Promise<PresetSnapshot> {
    if (draft.sourceId === null || draft.sourceRevision === null) throw new ContractError(ERROR_CODES.invalidMessage, 'load a preset before updating');
    return requirePreset(await this.#request('command', PRESET_RUNTIME_OPERATIONS.update, {
      presetId: draft.sourceId,
      expectedRevision: draft.sourceRevision,
      ...inputFromDraft(draft),
    }));
  }

  async duplicate(source: PresetSnapshot, name?: string): Promise<PresetSnapshot> {
    return requirePreset(await this.#request('command', PRESET_RUNTIME_OPERATIONS.duplicate, {
      presetId: source.id,
      expectedRevision: source.revision,
      ...(name === undefined ? {} : { name }),
    }));
  }

  async delete(source: PresetSnapshot): Promise<void> {
    await this.#request('command', PRESET_RUNTIME_OPERATIONS.delete, { presetId: source.id, expectedRevision: source.revision });
  }

  async #request(intent: MessageIntent, operation: string, payload: JsonObject): Promise<unknown> {
    const request = createRequest({ requestSequence: ++this.#requestSequence, intent, source: 'sidepanel', target: 'background', operation, payload });
    const response = requireMessageEnvelope(await this.#runtime.sendMessage(request));
    if (response.kind !== 'response' || response.requestId !== request.requestId || response.requestSequence !== request.requestSequence || response.operation !== operation) {
      throw new ContractError(ERROR_CODES.invalidMessage, 'preset response correlation failed');
    }
    if (!response.outcome.ok) throw new ContractError(response.outcome.error.code, response.outcome.error.message, response.outcome.error.details);
    return response.outcome.value;
  }
}
