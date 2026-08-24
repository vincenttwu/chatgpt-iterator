import type { DurableRunManager } from '../runs/manager.ts';
import type { DurableRunSnapshot } from '../runs/types.ts';

export type RunControlAction = 'pause'|'resume'|'stop';

export interface RunExecutionController {
  activate(snapshot: DurableRunSnapshot): void;
  cancel(runId: string): Promise<void>;
}

export async function executeRunControl(
  manager: DurableRunManager,
  execution: RunExecutionController|undefined,
  action: RunControlAction,
  runId: string,
  expectedGeneration: unknown,
  commandId: string,
) {
  const result = action === 'pause'
    ? await manager.pause(runId, expectedGeneration, commandId)
    : action === 'resume'
      ? await manager.resume(runId, expectedGeneration, commandId)
      : await manager.stop(runId, expectedGeneration, commandId);
  if (execution !== undefined) {
    if (action === 'pause' || action === 'stop') await execution.cancel(runId);
    else if (!result.idempotent) execution.activate(result.snapshot);
  }
  return result;
}
