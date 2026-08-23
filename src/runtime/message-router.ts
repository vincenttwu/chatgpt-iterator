import { requireMessageEnvelope } from '../core/index.ts';
import type { ControlPlaneServer } from '../control-plane/server.ts';
import { TAB_RUNTIME_OPERATIONS } from '../tabs/types.ts';
import type { RuntimeMessageSenderLike, TabRuntimeServer } from './tab-runtime-server.ts';

const TAB_OPERATIONS = new Set<string>(Object.values(TAB_RUNTIME_OPERATIONS));

export class BackgroundMessageRouter {
  readonly #control: ControlPlaneServer;
  readonly #tabs: TabRuntimeServer;

  constructor(control: ControlPlaneServer, tabs: TabRuntimeServer) {
    this.#control = control;
    this.#tabs = tabs;
  }

  async handle(raw: unknown, sender: RuntimeMessageSenderLike = {}): Promise<unknown> {
    const message = requireMessageEnvelope(raw);
    return TAB_OPERATIONS.has(message.operation) ? this.#tabs.handle(message, sender) : this.#control.handle(message);
  }
}
