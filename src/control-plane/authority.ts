import { freezeJsonValue } from '../core/json.ts';
import { TAB_REGISTRY_SCHEMA_VERSION, type ChatGptTabRegistrySnapshot } from '../tabs/types.ts';
import { CONTROL_PLANE_SCHEMA_VERSION, type ControlPlaneSnapshot } from './types.ts';

const EMPTY_TABS: ChatGptTabRegistrySnapshot = freezeJsonValue({
  schemaVersion: TAB_REGISTRY_SCHEMA_VERSION,
  revision: 0,
  targets: [],
  binding: null,
  lastTermination: null,
});

export class ControlPlaneAuthority {
  #revision = 1;
  #tabs: ChatGptTabRegistrySnapshot = EMPTY_TABS;
  readonly #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.#now = now;
  }

  revision(): number { return this.#revision; }

  touch(): number {
    this.#revision += 1;
    return this.#revision;
  }

  setTabs(snapshot: ChatGptTabRegistrySnapshot): number {
    this.#tabs = freezeJsonValue(snapshot);
    return this.touch();
  }

  snapshot(requestSequence: number): ControlPlaneSnapshot {
    return freezeJsonValue({
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      requestSequence,
      authorityRevision: this.#revision,
      generatedAt: this.#now(),
      runtime: { state: 'ready' },
      tabs: this.#tabs,
    });
  }
}
