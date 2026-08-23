import { ContractError, ERROR_CODES } from '../core/index.ts';
import type { ApplicationRepositories, RepositoryTransaction } from '../persistence/repositories.ts';
import type { QueueItemRecord, QueueRecord } from '../persistence/types.ts';
import { requireEntityId, requireRevision } from '../persistence/types.ts';
import { createQueueItemRecord, createQueueRecord, requireQueueName, requireQueueWriteInput, updateQueueRecord } from './model.ts';
import type { QueueHydration, QueueReferenceCatalog, QueueWriteInput, ResolvedQueueItem } from './types.ts';

function compareNamed(left: { readonly name: string; readonly id: string }, right: { readonly name: string; readonly id: string }): number {
  const a = left.name.toLocaleLowerCase('en'); const b = right.name.toLocaleLowerCase('en');
  return a < b ? -1 : a > b ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

async function orderedItems(tx: RepositoryTransaction, queueId: string): Promise<QueueItemRecord[]> {
  return (await tx.repository('queueItems').listByIndex('byQueueId', queueId)).sort((a, b) => a.position - b.position);
}

async function validateTemplateReferences(tx: RepositoryTransaction, input: QueueWriteInput): Promise<void> {
  const templates = tx.repository('templates');
  for (const item of input.items) {
    if (item.templateId === null) continue;
    const template = await templates.get(item.templateId);
    if (template === undefined) throw new ContractError(ERROR_CODES.unavailable, 'queue template reference does not exist');
    if (item.enabled && !template.enabled) throw new ContractError(ERROR_CODES.unavailable, 'enabled queue item cannot reference a disabled template');
  }
}

export class QueueService {
  readonly #repositories: ApplicationRepositories;
  readonly #now: () => string;
  readonly #id: () => string;
  constructor(repositories: ApplicationRepositories, now: () => string = () => new Date().toISOString(), id: () => string = () => crypto.randomUUID()) {
    this.#repositories = repositories; this.#now = now; this.#id = id;
  }

  async list(): Promise<QueueRecord[]> {
    const rows = await this.#repositories.readonly(['queues'], async (tx) => await tx.repository('queues').list());
    return rows.sort(compareNamed);
  }
  async get(id: string): Promise<QueueHydration | undefined> {
    requireEntityId(id, 'queue id');
    return await this.#repositories.readonly(['queues','queueItems','templates'], async (tx) => {
      const queue = await tx.repository('queues').get(id); if (queue === undefined) return undefined;
      return await this.#hydrate(tx, queue);
    });
  }
  async references(): Promise<QueueReferenceCatalog> {
    return await this.#repositories.readonly(['templates'], async (tx) => ({ templates: (await tx.repository('templates').list()).sort(compareNamed).map(({id,revision,name,enabled}) => Object.freeze({id,revision,name,enabled})) }));
  }
  async create(id: string, rawInput: unknown): Promise<QueueHydration> {
    requireEntityId(id, 'queue id'); const input = requireQueueWriteInput(rawInput);
    return await this.#repositories.mutateConfiguration(async (tx) => {
      const existing = await tx.repository('queues').get(id); if (existing !== undefined) return await this.#hydrate(tx, existing);
      await validateTemplateReferences(tx, input); const now = this.#now(); const queue = createQueueRecord(input.name, id, now);
      await tx.repository('queues').put(queue); await this.#replaceItems(tx, queue, input, now, new Map());
      return await this.#hydrate(tx, queue);
    });
  }
  async update(id: string, expectedRevision: unknown, rawInput: unknown): Promise<QueueHydration> {
    requireEntityId(id, 'queue id'); const revision = requireRevision(expectedRevision, 'expected queue revision'); const input = requireQueueWriteInput(rawInput);
    return await this.#repositories.mutateConfiguration(async (tx) => {
      const queues = tx.repository('queues'); const current = await queues.get(id);
      if (current === undefined) throw new ContractError(ERROR_CODES.unavailable, 'queue not found');
      if (current.revision !== revision) throw new ContractError(ERROR_CODES.staleRequest, 'queue revision changed; reload before updating');
      await validateTemplateReferences(tx, input); const existingItems = await orderedItems(tx, id); const existingById = new Map(existingItems.map((item) => [item.id,item]));
      const allowed = new Set(existingItems.map((item) => item.id));
      for (const item of input.items) if (item.id !== null && !allowed.has(item.id)) throw new ContractError(ERROR_CODES.staleRequest, 'queue item identity does not belong to this queue');
      const now = this.#now(); const next = updateQueueRecord(current, input.name, now); await queues.put(next);
      await this.#replaceItems(tx, next, input, now, existingById); return await this.#hydrate(tx, next);
    });
  }
  async duplicate(sourceId: string, expectedRevision: unknown, newId: string, rawName?: unknown): Promise<QueueHydration> {
    requireEntityId(sourceId, 'source queue id'); requireEntityId(newId, 'duplicate queue id'); const revision = requireRevision(expectedRevision, 'expected queue revision');
    return await this.#repositories.mutateConfiguration(async (tx) => {
      const queues = tx.repository('queues'); const source = await queues.get(sourceId);
      if (source === undefined) throw new ContractError(ERROR_CODES.unavailable, 'queue not found');
      if (source.revision !== revision) throw new ContractError(ERROR_CODES.staleRequest, 'queue revision changed; reload before duplicating');
      const existing = await queues.get(newId); if (existing !== undefined) return await this.#hydrate(tx, existing);
      const sourceItems = await orderedItems(tx, sourceId); const input = requireQueueWriteInput({ name: typeof rawName === 'string' && rawName.trim() ? requireQueueName(rawName) : `${source.name} Copy`, items: sourceItems.map((item) => ({ id: null, message:item.message, templateId:item.templateId, enabled:item.enabled, delayAfterSeconds:item.delayAfterSeconds })) });
      await validateTemplateReferences(tx, input); const now = this.#now(); const queue = createQueueRecord(input.name, newId, now); await queues.put(queue); await this.#replaceItems(tx, queue, input, now, new Map()); return await this.#hydrate(tx, queue);
    });
  }
  async delete(id: string, expectedRevision: unknown): Promise<void> {
    requireEntityId(id, 'queue id'); const revision = requireRevision(expectedRevision, 'expected queue revision');
    await this.#repositories.mutateConfiguration(async (tx) => {
      const queue = await tx.repository('queues').get(id); if (queue === undefined) return;
      if (queue.revision !== revision) throw new ContractError(ERROR_CODES.staleRequest, 'queue revision changed; reload before deleting');
      const presetRefs = (await tx.repository('presets').list()).filter((preset) => preset.queueId === id);
      if (presetRefs.length > 0) throw new ContractError(ERROR_CODES.staleRequest, 'queue is referenced by a preset; update or delete the preset first');
      for (const item of await orderedItems(tx,id)) await tx.repository('queueItems').delete(item.id);
      await tx.repository('queues').delete(id);
    });
  }
  async hydrate(id: string): Promise<QueueHydration> {
    requireEntityId(id, 'queue id');
    return await this.#repositories.readonly(['queues','queueItems','templates'], async (tx) => {
      const queue = await tx.repository('queues').get(id); if (queue === undefined) throw new ContractError(ERROR_CODES.unavailable, 'queue not found'); return await this.#hydrate(tx,queue);
    });
  }
  async #replaceItems(tx: RepositoryTransaction, queue: QueueRecord, input: QueueWriteInput, now: string, existingById: Map<string,QueueItemRecord>): Promise<void> {
    const store = tx.repository('queueItems'); for (const item of await orderedItems(tx,queue.id)) await store.delete(item.id);
    for (let position=0; position<input.items.length; position++) {
      const item=input.items[position]!; const id=item.id ?? this.#id(); const previous=existingById.get(id);
      await store.put(createQueueItemRecord(item,id,queue.id,position,now,previous?.createdAt ?? now));
    }
  }
  async #hydrate(tx: RepositoryTransaction, queue: QueueRecord): Promise<QueueHydration> {
    const items=await orderedItems(tx,queue.id); const resolvedItems: ResolvedQueueItem[]=[]; const templates=tx.repository('templates');
    for (const item of items) {
      if (!item.enabled) continue;
      if (item.message !== null) { resolvedItems.push(Object.freeze({id:item.id,position:item.position,source:'literal',templateId:null,templateRevision:null,content:item.message,delayAfterSeconds:item.delayAfterSeconds})); continue; }
      const template=await templates.get(item.templateId!); if (template===undefined) throw new ContractError(ERROR_CODES.unavailable,'queue template reference does not exist');
      if (!template.enabled) throw new ContractError(ERROR_CODES.unavailable,'queue template reference is disabled');
      resolvedItems.push(Object.freeze({id:item.id,position:item.position,source:'template',templateId:template.id,templateRevision:template.revision,content:template.body,delayAfterSeconds:item.delayAfterSeconds}));
    }
    if (resolvedItems.length<1) throw new ContractError(ERROR_CODES.invalidMessage,'queue has no enabled executable items');
    return Object.freeze({schemaVersion:1 as const,queue,items:Object.freeze(items),resolvedItems:Object.freeze(resolvedItems)}) as QueueHydration;
  }
}
