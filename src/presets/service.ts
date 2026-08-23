import { ContractError, ERROR_CODES } from '../core/index.ts';
import type { ApplicationRepositories, RepositoryTransaction } from '../persistence/repositories.ts';
import type { PresetRecord } from '../persistence/types.ts';
import { requireEntityId, requireRevision } from '../persistence/types.ts';
import { createPresetRecord, requirePresetName, requirePresetWriteInput, updatePresetRecord } from './model.ts';
import type { PresetHydration, PresetReferenceCatalog, PresetWriteInput } from './types.ts';

function compareNamed(left: { readonly name: string; readonly id: string }, right: { readonly name: string; readonly id: string }): number {
  const a = left.name.toLocaleLowerCase('en');
  const b = right.name.toLocaleLowerCase('en');
  if (a < b) return -1;
  if (a > b) return 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

async function assertReferences(transaction: RepositoryTransaction, input: PresetWriteInput): Promise<void> {
  if (input.mode === 'repeat') {
    const template = await transaction.repository('templates').get(input.templateId!);
    if (template === undefined) throw new ContractError(ERROR_CODES.unavailable, 'preset template reference does not exist');
    return;
  }
  const queue = await transaction.repository('queues').get(input.queueId!);
  if (queue === undefined) throw new ContractError(ERROR_CODES.unavailable, 'preset queue reference does not exist');
}

export class PresetService {
  readonly #repositories: ApplicationRepositories;
  readonly #now: () => string;

  constructor(repositories: ApplicationRepositories, now: () => string = () => new Date().toISOString()) {
    this.#repositories = repositories;
    this.#now = now;
  }

  async list(): Promise<PresetRecord[]> {
    const rows = await this.#repositories.readonly(['presets'], async (tx) => await tx.repository('presets').list());
    return rows.sort(compareNamed);
  }

  async get(id: string): Promise<PresetRecord | undefined> {
    requireEntityId(id, 'preset id');
    return await this.#repositories.readonly(['presets'], async (tx) => await tx.repository('presets').get(id));
  }

  async references(): Promise<PresetReferenceCatalog> {
    return await this.#repositories.readonly(['templates', 'queues'], async (tx) => {
      const [templates, queues] = await Promise.all([tx.repository('templates').list(), tx.repository('queues').list()]);
      return Object.freeze({
        templates: templates.sort(compareNamed).map(({ id, revision, name, enabled }) => Object.freeze({ id, revision, name, enabled })),
        queues: queues.sort(compareNamed).map(({ id, revision, name }) => Object.freeze({ id, revision, name })),
      });
    });
  }

  async create(id: string, rawInput: unknown): Promise<PresetRecord> {
    requireEntityId(id, 'preset id');
    const input = requirePresetWriteInput(rawInput);
    return await this.#repositories.mutateConfiguration(async (tx) => {
      const presets = tx.repository('presets');
      const existing = await presets.get(id);
      if (existing !== undefined) return existing;
      await assertReferences(tx, input);
      const record = createPresetRecord(input, id, this.#now());
      await presets.put(record);
      return record;
    });
  }

  async update(id: string, expectedRevision: unknown, rawInput: unknown): Promise<PresetRecord> {
    requireEntityId(id, 'preset id');
    const revision = requireRevision(expectedRevision, 'expected preset revision');
    const input = requirePresetWriteInput(rawInput);
    return await this.#repositories.mutateConfiguration(async (tx) => {
      const presets = tx.repository('presets');
      const current = await presets.get(id);
      if (current === undefined) throw new ContractError(ERROR_CODES.unavailable, 'preset not found');
      if (current.revision !== revision) throw new ContractError(ERROR_CODES.staleRequest, 'preset revision changed; reload before updating');
      await assertReferences(tx, input);
      const next = updatePresetRecord(current, input, this.#now());
      await presets.put(next);
      return next;
    });
  }

  async duplicate(sourceId: string, expectedRevision: unknown, newId: string, rawName?: unknown): Promise<PresetRecord> {
    requireEntityId(sourceId, 'source preset id');
    requireEntityId(newId, 'duplicate preset id');
    const revision = requireRevision(expectedRevision, 'expected preset revision');
    return await this.#repositories.mutateConfiguration(async (tx) => {
      const presets = tx.repository('presets');
      const current = await presets.get(sourceId);
      if (current === undefined) throw new ContractError(ERROR_CODES.unavailable, 'preset not found');
      if (current.revision !== revision) throw new ContractError(ERROR_CODES.staleRequest, 'preset revision changed; reload before duplicating');
      const existing = await presets.get(newId);
      if (existing !== undefined) return existing;
      const input = requirePresetWriteInput({
        ...current,
        name: typeof rawName === 'string' && rawName.trim() ? requirePresetName(rawName) : `${current.name} Copy`,
      });
      await assertReferences(tx, input);
      const duplicate = createPresetRecord(input, newId, this.#now());
      await presets.put(duplicate);
      return duplicate;
    });
  }

  async delete(id: string, expectedRevision: unknown): Promise<void> {
    requireEntityId(id, 'preset id');
    const revision = requireRevision(expectedRevision, 'expected preset revision');
    await this.#repositories.write(['presets'], async (tx) => {
      const presets = tx.repository('presets');
      const current = await presets.get(id);
      if (current === undefined) return;
      if (current.revision !== revision) throw new ContractError(ERROR_CODES.staleRequest, 'preset revision changed; reload before deleting');
      await presets.delete(id);
    });
  }

  async hydrate(id: string): Promise<PresetHydration> {
    requireEntityId(id, 'preset id');
    return await this.#repositories.readonly(['presets', 'templates', 'queues'], async (tx) => {
      const preset = await tx.repository('presets').get(id);
      if (preset === undefined) throw new ContractError(ERROR_CODES.unavailable, 'preset not found');
      if (preset.mode === 'repeat') {
        if (preset.templateId === null) throw new ContractError(ERROR_CODES.invalidMessage, 'repeat preset is missing template reference');
        const template = await tx.repository('templates').get(preset.templateId);
        if (template === undefined) throw new ContractError(ERROR_CODES.unavailable, 'preset template reference no longer exists');
        if (!template.enabled) throw new ContractError(ERROR_CODES.unavailable, 'preset template is disabled');
        return Object.freeze({
          schemaVersion: 1 as const,
          mode: 'repeat' as const,
          preset,
          template,
          messageTemplate: template.body,
          totalIterations: preset.iterationCount,
          delaySeconds: preset.delaySeconds,
          autoContinue: preset.autoContinue,
          autoScroll: preset.autoScroll,
          preventDiscard: preset.preventDiscard,
        });
      }
      if (preset.queueId === null) throw new ContractError(ERROR_CODES.invalidMessage, 'queue preset is missing queue reference');
      const queue = await tx.repository('queues').get(preset.queueId);
      if (queue === undefined) throw new ContractError(ERROR_CODES.unavailable, 'preset queue reference no longer exists');
      return Object.freeze({
        schemaVersion: 1 as const,
        mode: 'queue' as const,
        preset,
        queue,
        delaySeconds: preset.delaySeconds,
        autoContinue: preset.autoContinue,
        autoScroll: preset.autoScroll,
        preventDiscard: preset.preventDiscard,
      });
    });
  }
}
