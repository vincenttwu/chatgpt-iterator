import { ContractError, ERROR_CODES } from '../core/index.ts';
import type { ApplicationRepositories } from '../persistence/repositories.ts';
import type { TemplateRecord } from '../persistence/types.ts';
import { requireEntityId, requireRevision } from '../persistence/types.ts';
import { createTemplateRecord, requireTemplateWriteInput, updateTemplateRecord } from './model.ts';
import type { TemplateWriteInput } from './types.ts';

function compareTemplates(left: TemplateRecord, right: TemplateRecord): number {
  const leftName = left.name.toLocaleLowerCase('en');
  const rightName = right.name.toLocaleLowerCase('en');
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export class TemplateService {
  readonly #repositories: ApplicationRepositories;
  readonly #now: () => string;

  constructor(repositories: ApplicationRepositories, now: () => string = () => new Date().toISOString()) {
    this.#repositories = repositories;
    this.#now = now;
  }

  async list(): Promise<TemplateRecord[]> {
    const rows = await this.#repositories.readonly(['templates'], async (tx) => await tx.repository('templates').list());
    return rows.sort(compareTemplates);
  }

  async get(id: string): Promise<TemplateRecord | undefined> {
    requireEntityId(id, 'template id');
    return await this.#repositories.readonly(['templates'], async (tx) => await tx.repository('templates').get(id));
  }

  async create(id: string, rawInput: unknown): Promise<TemplateRecord> {
    requireEntityId(id, 'template id');
    const input = requireTemplateWriteInput(rawInput);
    return await this.#repositories.write(['templates'], async (tx) => {
      const templates = tx.repository('templates');
      const existing = await templates.get(id);
      if (existing !== undefined) return existing;
      const record = createTemplateRecord(input, id, this.#now());
      await templates.put(record);
      return record;
    });
  }

  async update(id: string, expectedRevision: unknown, rawInput: unknown): Promise<TemplateRecord> {
    requireEntityId(id, 'template id');
    const revision = requireRevision(expectedRevision, 'expected template revision');
    const input = requireTemplateWriteInput(rawInput);
    return await this.#repositories.write(['templates'], async (tx) => {
      const templates = tx.repository('templates');
      const current = await templates.get(id);
      if (current === undefined) throw new ContractError(ERROR_CODES.unavailable, 'template not found');
      if (current.revision !== revision) {
        throw new ContractError(ERROR_CODES.staleRequest, 'template revision changed; reload before updating');
      }
      const next = updateTemplateRecord(current, input, this.#now());
      await templates.put(next);
      return next;
    });
  }

  async duplicate(sourceId: string, expectedRevision: unknown, newId: string, rawName?: unknown): Promise<TemplateRecord> {
    requireEntityId(sourceId, 'source template id');
    requireEntityId(newId, 'duplicate template id');
    const revision = requireRevision(expectedRevision, 'expected template revision');
    return await this.#repositories.write(['templates'], async (tx) => {
      const templates = tx.repository('templates');
      const current = await templates.get(sourceId);
      if (current === undefined) throw new ContractError(ERROR_CODES.unavailable, 'template not found');
      if (current.revision !== revision) {
        throw new ContractError(ERROR_CODES.staleRequest, 'template revision changed; reload before duplicating');
      }
      const existing = await templates.get(newId);
      if (existing !== undefined) return existing;
      const input: TemplateWriteInput = requireTemplateWriteInput({
        name: typeof rawName === 'string' && rawName.trim() ? rawName : `${current.name} Copy`,
        body: current.body,
        enabled: current.enabled,
      });
      const duplicate = createTemplateRecord(input, newId, this.#now());
      await templates.put(duplicate);
      return duplicate;
    });
  }

  async delete(id: string, expectedRevision: unknown): Promise<void> {
    requireEntityId(id, 'template id');
    const revision = requireRevision(expectedRevision, 'expected template revision');
    await this.#repositories.write(['templates', 'presets'], async (tx) => {
      const templates = tx.repository('templates');
      const current = await templates.get(id);
      if (current === undefined) return;
      if (current.revision !== revision) {
        throw new ContractError(ERROR_CODES.staleRequest, 'template revision changed; reload before deleting');
      }
      const references = (await tx.repository('presets').list()).filter((preset) => preset.templateId === id);
      if (references.length > 0) {
        throw new ContractError(ERROR_CODES.staleRequest, 'template is referenced by a preset; update or delete the preset first');
      }
      await templates.delete(id);
    });
  }
}
