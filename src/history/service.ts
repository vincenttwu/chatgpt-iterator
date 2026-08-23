import { freezeJsonValue } from '../core/index.ts';
import type { ApplicationRepositories } from '../persistence/index.ts';
import { requireRunSnapshot } from '../runs/model.ts';
import { isRunTerminal, type DurableRunSnapshot } from '../runs/types.ts';
import { requireHistoryLimit } from '../settings/model.ts';
import { HISTORY_SCHEMA_VERSION, type HistoryMutationResult, type RunHistoryEntry, type RunHistorySnapshot } from './types.ts';

function newestFirst(a: DurableRunSnapshot, b: DurableRunSnapshot): number { return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id); }
function toEntry(run: DurableRunSnapshot): RunHistoryEntry {
  if (!isRunTerminal(run.lifecycleState)) throw new TypeError('history entry must be terminal');
  return freezeJsonValue({
    schemaVersion: HISTORY_SCHEMA_VERSION,
    id: run.id,
    lifecycleState: run.lifecycleState,
    mode: run.execution.mode,
    targetTabId: run.targetTabId,
    targetWindowId: run.targetWindowId,
    completedIterations: run.execution.completedIterations,
    totalIterations: run.execution.totalIterations,
    failureCode: run.failure?.code ?? null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  });
}

export class RunHistoryService {
  readonly #repositories: ApplicationRepositories;
  constructor(repositories: ApplicationRepositories) { this.#repositories = repositories; }

  async list(limitValue: unknown): Promise<RunHistorySnapshot> {
    const limit = requireHistoryLimit(limitValue);
    const terminal = await this.#terminalRuns();
    return freezeJsonValue({ schemaVersion: HISTORY_SCHEMA_VERSION, limit, totalRetained: terminal.length, entries: terminal.slice(0, limit).map(toEntry) });
  }

  async clear(): Promise<HistoryMutationResult> { return await this.#removeWhere(() => true); }

  async enforceRetention(limitValue: unknown): Promise<HistoryMutationResult> {
    const limit = requireHistoryLimit(limitValue);
    const terminal = await this.#terminalRuns();
    const removeIds = new Set(terminal.slice(limit).map((run) => run.id));
    if (removeIds.size === 0) return freezeJsonValue({ schemaVersion: HISTORY_SCHEMA_VERSION, removedRuns: 0, removedEvents: 0 });
    return await this.#removeWhere((run) => removeIds.has(run.id));
  }

  async #terminalRuns(): Promise<DurableRunSnapshot[]> {
    const runs = await this.#repositories.readonly(['runs'], async (tx) => await tx.repository('runs').list());
    return runs.map((record) => requireRunSnapshot(record.state)).filter((run) => isRunTerminal(run.lifecycleState)).sort(newestFirst);
  }

  async #removeWhere(predicate: (run: DurableRunSnapshot) => boolean): Promise<HistoryMutationResult> {
    return await this.#repositories.write(['runs', 'runEvents'], async (tx) => {
      const runs = tx.repository('runs');
      const events = tx.repository('runEvents');
      let removedRuns = 0; let removedEvents = 0;
      for (const row of await runs.list()) {
        const run = requireRunSnapshot(row.state);
        if (!isRunTerminal(run.lifecycleState) || !predicate(run)) continue;
        for (const event of await events.listByIndex('byRunId', run.id)) { await events.delete(event.id); removedEvents += 1; }
        await runs.delete(run.id); removedRuns += 1;
      }
      return freezeJsonValue({ schemaVersion: HISTORY_SCHEMA_VERSION, removedRuns, removedEvents });
    });
  }
}
