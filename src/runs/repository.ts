import { ContractError, ERROR_CODES, freezeJsonValue } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import type { ApplicationRepositories, RunEventRecord, RunRecord } from '../persistence/index.ts';
import { requireEntityId, requireSequence } from '../persistence/types.ts';
import { requireRunSnapshot } from './model.ts';
import { RUN_EVENT_HISTORY_LIMIT, RUN_EVENT_SCHEMA_VERSION, type DurableRunSnapshot, type RunEventType } from './types.ts';

function toRunRecord(snapshot: DurableRunSnapshot): RunRecord {
  return freezeJsonValue({
    schemaVersion: 1,
    id: snapshot.id,
    logicalVersion: snapshot.schemaVersion,
    state: snapshot,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  });
}

function fromRunRecord(record: RunRecord): DurableRunSnapshot {
  return requireRunSnapshot(record.state);
}

function boundedPayload(payload: JsonObject): JsonObject {
  const text = JSON.stringify(payload);
  if (text.length > 4096) throw new ContractError(ERROR_CODES.invalidMessage, 'run event payload exceeds 4096 bytes');
  return freezeJsonValue(payload);
}

function commandFrom(event: RunEventRecord): string | null {
  const value = event.payload.commandId;
  return typeof value === 'string' ? value : null;
}

export interface RunMutationResult {
  readonly snapshot: DurableRunSnapshot;
  readonly idempotent: boolean;
}

export class DurableRunRepository {
  readonly #repositories: ApplicationRepositories;
  readonly #now: () => string;
  readonly #id: () => string;

  constructor(repositories: ApplicationRepositories, options: { now?: () => string; id?: () => string } = {}) {
    this.#repositories = repositories;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#id = options.id ?? (() => crypto.randomUUID());
  }

  now(): string { return this.#now(); }
  createId(): string { return requireEntityId(this.#id(), 'generated id'); }

  async get(runId: string): Promise<DurableRunSnapshot | undefined> {
    requireEntityId(runId, 'run id');
    return await this.#repositories.readonly(['runs'], async (tx) => {
      const record = await tx.repository('runs').get(runId);
      return record === undefined ? undefined : fromRunRecord(record);
    });
  }

  async list(): Promise<DurableRunSnapshot[]> {
    return await this.#repositories.readonly(['runs'], async (tx) => (await tx.repository('runs').list()).map(fromRunRecord));
  }

  async events(runId: string): Promise<RunEventRecord[]> {
    requireEntityId(runId, 'run id');
    return await this.#repositories.readonly(['runEvents'], async (tx) => {
      const rows = await tx.repository('runEvents').listByIndex('byRunId', runId);
      return rows.sort((a, b) => a.sequence - b.sequence);
    });
  }

  async create(snapshot: DurableRunSnapshot, commandId: string): Promise<RunMutationResult> {
    requireEntityId(commandId, 'command id');
    return await this.#repositories.write(['runs', 'runEvents'], async (tx) => {
      const runs = tx.repository('runs');
      const events = tx.repository('runEvents');
      const existing = await runs.get(snapshot.id);
      if (existing !== undefined) {
        const priorEvents = await events.listByIndex('byRunId', snapshot.id);
        if (priorEvents.some((row) => commandFrom(row) === commandId)) return { snapshot: fromRunRecord(existing), idempotent: true };
        throw new ContractError(ERROR_CODES.staleRequest, 'run id already exists');
      }
      await runs.put(toRunRecord(snapshot));
      await events.put({
        schemaVersion: RUN_EVENT_SCHEMA_VERSION,
        id: this.createId(),
        runId: snapshot.id,
        sequence: 0,
        eventType: 'created',
        payload: boundedPayload({ commandId, to: 'ready', generation: snapshot.generation }),
        occurredAt: snapshot.createdAt,
      });
      return { snapshot, idempotent: false };
    });
  }

  async mutate(input: {
    runId: string;
    expectedGeneration: number;
    commandId: string;
    eventType: RunEventType;
    transform: (current: DurableRunSnapshot, now: string) => DurableRunSnapshot;
    payload?: JsonObject;
  }): Promise<RunMutationResult> {
    requireEntityId(input.runId, 'run id');
    requireEntityId(input.commandId, 'command id');
    requireSequence(input.expectedGeneration, 'expected generation');
    return await this.#repositories.write(['runs', 'runEvents'], async (tx) => {
      const runs = tx.repository('runs');
      const events = tx.repository('runEvents');
      const record = await runs.get(input.runId);
      if (record === undefined) throw new ContractError(ERROR_CODES.unavailable, 'run not found');
      const current = fromRunRecord(record);
      const history = (await events.listByIndex('byRunId', input.runId)).sort((a, b) => a.sequence - b.sequence);
      const duplicate = history.find((row) => commandFrom(row) === input.commandId);
      if (duplicate !== undefined) return { snapshot: current, idempotent: true };
      if (current.generation !== input.expectedGeneration) throw new ContractError(ERROR_CODES.staleRequest, `run generation is ${current.generation}, expected ${input.expectedGeneration}`);
      const next = requireRunSnapshot(input.transform(current, this.now()));
      if (next.id !== current.id || next.generation !== current.generation + 1) throw new ContractError(ERROR_CODES.internal, 'run mutation must preserve id and advance generation exactly once');
      await runs.put(toRunRecord(next));
      const sequence = history.length === 0 ? 0 : Math.max(...history.map((row) => row.sequence)) + 1;
      await events.put({
        schemaVersion: RUN_EVENT_SCHEMA_VERSION,
        id: this.createId(),
        runId: next.id,
        sequence,
        eventType: input.eventType,
        payload: boundedPayload({ commandId: input.commandId, from: current.lifecycleState, to: next.lifecycleState, generation: next.generation, ...(input.payload ?? {}) }),
        occurredAt: next.updatedAt,
      });
      const retained = [...history, { id: '', sequence }].sort((a, b) => a.sequence - b.sequence);
      const overflow = Math.max(0, retained.length - RUN_EVENT_HISTORY_LIMIT);
      for (const row of retained.slice(0, overflow)) if (row.id) await events.delete(row.id);
      return { snapshot: next, idempotent: false };
    });
  }
}
