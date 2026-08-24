import { freezeJsonValue } from '../core/index.ts';
import type { ChatGptAdapterDiagnostics } from '../chatgpt/types.ts';
import type { ApplicationRepositories } from '../persistence/index.ts';
import { CHROME_STORAGE_PURPOSES } from '../persistence/chrome-storage.ts';
import { EXPORT_FORMAT_VERSION, LOGICAL_MODEL_VERSION, PHYSICAL_DB_VERSION } from '../persistence/versions.ts';
import type { DurableRunSnapshot } from '../runs/types.ts';
import { isRunTerminal } from '../runs/types.ts';
import type { ChatGptTabRegistrySnapshot } from '../tabs/types.ts';
import { DIAGNOSTICS_SCHEMA_VERSION, type AdapterDiagnosticsProjection, type DataInventory, type DiagnosticsSnapshot } from './types.ts';

export interface DiagnosticsRuntimeContext {
  readonly appVersion: string;
  readonly workerStartedAt: string;
  readonly connectedPanels: () => number;
  readonly tabs: () => ChatGptTabRegistrySnapshot;
  readonly runs: () => Promise<DurableRunSnapshot[]>;
  readonly adapterDiagnostics: (tabId: number) => Promise<ChatGptAdapterDiagnostics>;
}

export class DiagnosticsService {
  readonly #repositories: ApplicationRepositories;
  readonly #context: DiagnosticsRuntimeContext;
  readonly #now: () => string;
  constructor(repositories: ApplicationRepositories, context: DiagnosticsRuntimeContext, now: () => string = () => new Date().toISOString()) { this.#repositories = repositories; this.#context = context; this.#now = now; }

  async snapshot(): Promise<DiagnosticsSnapshot> {
    const tabs = this.#context.tabs();
    const runs = await this.#context.runs();
    const binding = tabs.binding;
    const boundTarget = binding === null ? undefined : tabs.targets.find((target) => target.tabId === binding.tabId && target.windowId === binding.windowId);
    const adapter = await this.#adapter(binding?.tabId ?? null);
    const { metadata, counts } = await this.#databaseProjection();
    const migration = metadata.get('logicalMigrationState')?.value ?? null;
    return freezeJsonValue({
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      generatedAt: this.#now(),
      runtime: {
        state: 'ready' as const,
        appVersion: this.#context.appVersion,
        workerStartedAt: this.#context.workerStartedAt,
        connectedPanels: this.#context.connectedPanels(),
        activeRuns: runs.filter((run) => !isRunTerminal(run.lifecycleState)).length,
        terminalRuns: runs.filter((run) => isRunTerminal(run.lifecycleState)).length,
      },
      tabs: { eligibleTargets: tabs.targets.length, boundTabId: binding?.tabId ?? null, boundLifecycle: boundTarget?.lifecycleState ?? null },
      adapter,
      database: { physicalDbVersion: PHYSICAL_DB_VERSION, logicalModelVersion: LOGICAL_MODEL_VERSION, exportFormatVersion: EXPORT_FORMAT_VERSION, migrationState: migration },
      storage: (Object.keys(CHROME_STORAGE_PURPOSES) as Array<keyof typeof CHROME_STORAGE_PURPOSES>).map((tier) => ({ tier, purpose: CHROME_STORAGE_PURPOSES[tier] })),
      data: counts,
      appearance: { mode: 'system' as const, source: 'system-colors' as const },
    });
  }

  async #adapter(tabId: number | null): Promise<AdapterDiagnosticsProjection> {
    if (tabId === null) return freezeJsonValue({ targetTabId: null, status: 'not_bound' as const, capabilities: [], reasonCodes: [], pageAlert: null });
    try {
      const raw = await this.#context.adapterDiagnostics(tabId);
      return freezeJsonValue({ targetTabId: tabId, status: raw.status, capabilities: raw.capabilities, reasonCodes: raw.reasonCodes ?? [], pageAlert: raw.pageAlert });
    } catch {
      return freezeJsonValue({ targetTabId: tabId, status: 'unreachable' as const, capabilities: [], reasonCodes: [], pageAlert: null });
    }
  }

  async #databaseProjection(): Promise<{ metadata: Map<string, { value: any }>; counts: DataInventory }> {
    return await this.#repositories.readonly(['metadata','templates','presets','queues','queueItems','runs','runEvents'], async (tx) => {
      const metadataRows = await tx.repository('metadata').list();
      const counts: DataInventory = {
        templates: (await tx.repository('templates').list()).length,
        presets: (await tx.repository('presets').list()).length,
        queues: (await tx.repository('queues').list()).length,
        queueItems: (await tx.repository('queueItems').list()).length,
        runs: (await tx.repository('runs').list()).length,
        runEvents: (await tx.repository('runEvents').list()).length,
      };
      return { metadata: new Map(metadataRows.map((row) => [row.key, row])), counts };
    });
  }
}
