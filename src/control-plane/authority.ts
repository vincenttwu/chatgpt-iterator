import { freezeJsonValue } from '../core/json.ts';
import { CONTROL_PLANE_SCHEMA_VERSION, type ControlPlaneSnapshot } from './types.ts';

export class ControlPlaneAuthority {
  #revision = 1;
  readonly #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.#now = now;
  }

  revision(): number { return this.#revision; }

  touch(): number {
    this.#revision += 1;
    return this.#revision;
  }

  snapshot(requestSequence: number): ControlPlaneSnapshot {
    return freezeJsonValue({
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      requestSequence,
      authorityRevision: this.#revision,
      generatedAt: this.#now(),
      runtime: { state: 'ready' },
    });
  }
}
