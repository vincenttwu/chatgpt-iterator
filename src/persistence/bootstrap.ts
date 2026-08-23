import type { IndexedDbFactoryLike } from './schema.ts';
import { openIteratorDatabase } from './schema.ts';
import { IndexedDbPersistenceDriver } from './driver.ts';
import { ApplicationRepositories } from './repositories.ts';
import { LOGICAL_MIGRATIONS, migrateLogicalModel } from './migrations.ts';
import { EXPORT_FORMAT_VERSION, LOGICAL_MODEL_VERSION, PHYSICAL_DB_VERSION } from './versions.ts';

export interface PersistenceRuntime {
  readonly repositories: ApplicationRepositories;
  close(): void;
}

export async function bootstrapApplicationPersistence(
  factory: IndexedDbFactoryLike = indexedDB,
  now: () => string = () => new Date().toISOString(),
): Promise<PersistenceRuntime> {
  const database = await openIteratorDatabase(factory);
  const driver = new IndexedDbPersistenceDriver(database);
  const repositories = new ApplicationRepositories(driver);
  await migrateLogicalModel(repositories, LOGICAL_MIGRATIONS, now);
  const stamp = now();
  await repositories.write(['metadata'], async (transaction) => {
    const metadata = transaction.repository('metadata');
    await metadata.put({ key: 'physicalDbVersion', value: PHYSICAL_DB_VERSION, updatedAt: stamp });
    await metadata.put({ key: 'logicalModelVersion', value: LOGICAL_MODEL_VERSION, updatedAt: stamp });
    await metadata.put({ key: 'exportFormatVersion', value: EXPORT_FORMAT_VERSION, updatedAt: stamp });
  });
  return { repositories, close: () => repositories.close() };
}
