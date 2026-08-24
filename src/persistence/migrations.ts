import type { JsonObject } from '../core/types.ts';
import type { MetadataRecord } from './types.ts';
import type { ApplicationRepositories } from './repositories.ts';
import { LOGICAL_MODEL_VERSION } from './versions.ts';
import { requireRunSnapshot } from '../runs/model.ts';

const MODEL_VERSION_KEY = 'logicalModelVersion';
const MIGRATION_STATE_KEY = 'logicalMigrationState';

export interface LogicalMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  run(repositories: ApplicationRepositories): Promise<void>;
}

export interface MigrationResult extends JsonObject {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: number;
}

function nowIso(now: () => string): string { return now(); }

async function readModelVersion(repositories: ApplicationRepositories): Promise<number> {
  return await repositories.readonly(['metadata'], async (transaction) => {
    const record = await transaction.repository('metadata').get(MODEL_VERSION_KEY);
    if (record === undefined) return 0;
    if (typeof record.value !== 'number' || !Number.isSafeInteger(record.value) || record.value < 0) throw new TypeError('logical model version metadata is invalid');
    return record.value;
  });
}

async function writeMetadata(repositories: ApplicationRepositories, record: MetadataRecord): Promise<void> {
  await repositories.write(['metadata'], async (transaction) => { await transaction.repository('metadata').put(record); });
}

export async function migrateLogicalModel(
  repositories: ApplicationRepositories,
  migrations: readonly LogicalMigration[],
  now: () => string = () => new Date().toISOString(),
): Promise<MigrationResult> {
  const startVersion = await readModelVersion(repositories);
  if (startVersion > LOGICAL_MODEL_VERSION) throw new Error(`logical model version ${startVersion} is newer than supported ${LOGICAL_MODEL_VERSION}`);
  let current = startVersion;
  let applied = 0;
  while (current < LOGICAL_MODEL_VERSION) {
    const migration = migrations.find((candidate) => candidate.fromVersion === current && candidate.toVersion === current + 1);
    if (migration === undefined) throw new Error(`missing logical migration ${current} -> ${current + 1}`);
    const stamp = nowIso(now);
    await writeMetadata(repositories, { key: MIGRATION_STATE_KEY, value: { state: 'running', fromVersion: current, toVersion: current + 1 }, updatedAt: stamp });
    await migration.run(repositories);
    current += 1;
    applied += 1;
    await repositories.write(['metadata'], async (transaction) => {
      const metadata = transaction.repository('metadata');
      await metadata.put({ key: MODEL_VERSION_KEY, value: current, updatedAt: stamp });
      await metadata.put({ key: MIGRATION_STATE_KEY, value: { state: 'complete', version: current }, updatedAt: stamp });
    });
  }
  return { fromVersion: startVersion, toVersion: current, applied };
}

/** Fresh v1 databases need no data rewrite; this migration establishes logical v1. */
export const LOGICAL_MIGRATIONS: readonly LogicalMigration[] = Object.freeze([
  { fromVersion: 0, toVersion: 1, async run() { /* no-op bootstrap migration */ } },
  {
    fromVersion: 1,
    toVersion: 2,
    async run(repositories) {
      await repositories.write(['runs'], async (transaction) => {
        const runs = transaction.repository('runs');
        for (const record of await runs.list()) {
          const state = requireRunSnapshot(record.state);
          if (record.logicalVersion === state.schemaVersion && JSON.stringify(record.state) === JSON.stringify(state)) continue;
          await runs.put({ ...record, logicalVersion: state.schemaVersion, state });
        }
      });
    },
  },
  {
    fromVersion: 2,
    toVersion: 3,
    async run(repositories) {
      await repositories.write(['runs'], async (transaction) => {
        const runs = transaction.repository('runs');
        for (const record of await runs.list()) {
          const state = requireRunSnapshot(record.state);
          if (record.logicalVersion === state.schemaVersion && JSON.stringify(record.state) === JSON.stringify(state)) continue;
          await runs.put({ ...record, logicalVersion: state.schemaVersion, state });
        }
      });
    },
  },
]);
