import { freezeJsonValue } from '../core/json.ts';
import { CONTROL_PLANE_PORT_NAME, CONTROL_PLANE_SCHEMA_VERSION, type ControlPlaneInvalidationReason } from './types.ts';

export interface RuntimePortLike {
  readonly name: string;
  postMessage(message: unknown): void;
  readonly onDisconnect: { addListener(listener: () => void): void };
}

export class ControlPlanePortHub {
  readonly #ports = new Set<RuntimePortLike>();
  #sequence = 0;

  attach(port: RuntimePortLike): boolean {
    if (port.name !== CONTROL_PLANE_PORT_NAME) return false;
    this.#ports.add(port);
    port.onDisconnect.addListener(() => this.#ports.delete(port));
    this.#send(port, 'connected');
    return true;
  }

  broadcast(reason: Exclude<ControlPlaneInvalidationReason, 'connected'>): void {
    for (const port of [...this.#ports]) {
      try { this.#send(port, reason); } catch { this.#ports.delete(port); }
    }
  }

  #send(port: RuntimePortLike, reason: ControlPlaneInvalidationReason): void {
    port.postMessage(freezeJsonValue({
      kind: 'invalidate',
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      sequence: ++this.#sequence,
      reason,
    }));
  }
}
