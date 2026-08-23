import { ContractError, ERROR_CODES, createRequest, requireMessageEnvelope } from '../core/index.ts';
import type { JsonObject, MessageIntent } from '../core/types.ts';
import { previewTemplate, requireTemplateBody, requireTemplateName, TEMPLATE_VARIABLES } from '../templates/model.ts';
import { TEMPLATE_RUNTIME_OPERATIONS, type TemplateSnapshot } from '../templates/types.ts';
import type { MessageContext } from '../messages/types.ts';

export interface TemplatePanelRuntimeLike { sendMessage(message: unknown): Promise<unknown>; }

export interface TemplateDraft {
  readonly sourceId: string | null;
  readonly sourceRevision: number | null;
  name: string;
  body: string;
  enabled: boolean;
}

export function blankTemplateDraft(): TemplateDraft {
  return { sourceId: null, sourceRevision: null, name: '', body: '', enabled: true };
}

export function templateDraftFrom(source: TemplateSnapshot): TemplateDraft {
  return { sourceId: source.id, sourceRevision: source.revision, name: source.name, body: source.body, enabled: source.enabled };
}

export function isTemplateDraftDirty(draft: TemplateDraft, base: TemplateSnapshot | undefined): boolean {
  if (base === undefined) return draft.name.trim().length > 0 || draft.body.length > 0 || draft.enabled !== true;
  return draft.name !== base.name || draft.body !== base.body || draft.enabled !== base.enabled;
}

export function isTemplateDraftStale(draft: TemplateDraft, latest: TemplateSnapshot | undefined): boolean {
  if (draft.sourceId === null || draft.sourceRevision === null) return false;
  return latest === undefined || latest.id !== draft.sourceId || latest.revision !== draft.sourceRevision;
}

export function validateTemplateDraft(draft: TemplateDraft): void {
  requireTemplateName(draft.name);
  requireTemplateBody(draft.body);
}

export const TEMPLATE_PREVIEW_CONTEXT: MessageContext = Object.freeze({
  iteration: 2,
  total: 5,
  remaining: 3,
  timestamp: '2026-08-24T00:00:00.000Z',
});

export function previewTemplateDraft(draft: TemplateDraft, context: MessageContext = TEMPLATE_PREVIEW_CONTEXT): string {
  validateTemplateDraft(draft);
  return previewTemplate(draft.body, context);
}

function requireTemplate(value: unknown): TemplateSnapshot {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError(ERROR_CODES.invalidMessage, 'template response must be an object');
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || typeof candidate.id !== 'string' || !Number.isSafeInteger(candidate.revision)) {
    throw new ContractError(ERROR_CODES.invalidMessage, 'invalid template response');
  }
  return candidate as unknown as TemplateSnapshot;
}

function requireTemplateList(value: unknown): TemplateSnapshot[] {
  if (!Array.isArray(value)) throw new ContractError(ERROR_CODES.invalidMessage, 'template list response must be an array');
  return value.map(requireTemplate);
}

export class SidePanelTemplateClient {
  readonly #runtime: TemplatePanelRuntimeLike;
  #requestSequence = 0;
  constructor(runtime: TemplatePanelRuntimeLike) { this.#runtime = runtime; }

  async list(): Promise<TemplateSnapshot[]> {
    return requireTemplateList(await this.#request('query', TEMPLATE_RUNTIME_OPERATIONS.list, {}));
  }

  async create(draft: TemplateDraft): Promise<TemplateSnapshot> {
    validateTemplateDraft(draft);
    return requireTemplate(await this.#request('command', TEMPLATE_RUNTIME_OPERATIONS.create, { name: draft.name, body: draft.body, enabled: draft.enabled }));
  }

  async update(draft: TemplateDraft): Promise<TemplateSnapshot> {
    validateTemplateDraft(draft);
    if (draft.sourceId === null || draft.sourceRevision === null) throw new ContractError(ERROR_CODES.invalidMessage, 'load a template before updating');
    return requireTemplate(await this.#request('command', TEMPLATE_RUNTIME_OPERATIONS.update, {
      templateId: draft.sourceId,
      expectedRevision: draft.sourceRevision,
      name: draft.name,
      body: draft.body,
      enabled: draft.enabled,
    }));
  }

  async duplicate(source: TemplateSnapshot, name?: string): Promise<TemplateSnapshot> {
    return requireTemplate(await this.#request('command', TEMPLATE_RUNTIME_OPERATIONS.duplicate, {
      templateId: source.id,
      expectedRevision: source.revision,
      ...(name === undefined ? {} : { name }),
    }));
  }

  async delete(source: TemplateSnapshot): Promise<void> {
    await this.#request('command', TEMPLATE_RUNTIME_OPERATIONS.delete, { templateId: source.id, expectedRevision: source.revision });
  }

  async #request(intent: MessageIntent, operation: string, payload: JsonObject): Promise<unknown> {
    const request = createRequest({ requestSequence: ++this.#requestSequence, intent, source: 'sidepanel', target: 'background', operation, payload });
    const response = requireMessageEnvelope(await this.#runtime.sendMessage(request));
    if (response.kind !== 'response' || response.requestId !== request.requestId || response.requestSequence !== request.requestSequence || response.operation !== operation) {
      throw new ContractError(ERROR_CODES.invalidMessage, 'template response correlation failed');
    }
    if (!response.outcome.ok) throw new ContractError(response.outcome.error.code, response.outcome.error.message, response.outcome.error.details);
    return response.outcome.value;
  }
}

export { TEMPLATE_VARIABLES };
