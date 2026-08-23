import type { JsonObject } from '../core/types.ts';

export const CONTROL_PLANE_SCHEMA_VERSION = 1 as const;
export const CONTROL_PLANE_PORT_NAME = 'chatgpt-iterator.panel.v1' as const;
export const CONTROL_PLANE_OPERATIONS = Object.freeze({ hydrate: 'panel.hydrate' } as const);

export type ControlPlaneInvalidationReason = 'connected' | 'authority_changed' | 'runtime_recovered';

export interface ControlPlaneSnapshot extends JsonObject {
  readonly schemaVersion: number;
  readonly requestSequence: number;
  readonly authorityRevision: number;
  readonly generatedAt: string;
  readonly runtime: {
    readonly state: 'ready';
  };
}

export interface ControlPlaneInvalidationHint extends JsonObject {
  readonly kind: 'invalidate';
  readonly schemaVersion: number;
  readonly sequence: number;
  readonly reason: ControlPlaneInvalidationReason;
}
