import { requireMessageEnvelope } from '../core/index.ts';
import { RUN_RUNTIME_OPERATIONS } from '../runs/types.ts';
import type { ControlPlaneServer } from '../control-plane/server.ts';
import { TAB_RUNTIME_OPERATIONS } from '../tabs/types.ts';
import { TEMPLATE_RUNTIME_OPERATIONS } from '../templates/types.ts';
import { PRESET_RUNTIME_OPERATIONS } from '../presets/types.ts';
import { QUEUE_RUNTIME_OPERATIONS } from '../queues/types.ts';
import type { RunRuntimeServer } from './run-runtime-server.ts';
import type { TemplateRuntimeServer } from './template-runtime-server.ts';
import type { PresetRuntimeServer } from './preset-runtime-server.ts';
import type { QueueRuntimeServer } from './queue-runtime-server.ts';
import type { RuntimeMessageSenderLike, TabRuntimeServer } from './tab-runtime-server.ts';

const TAB_OPERATIONS = new Set<string>(Object.values(TAB_RUNTIME_OPERATIONS));
const RUN_OPERATIONS = new Set<string>(Object.values(RUN_RUNTIME_OPERATIONS));
const TEMPLATE_OPERATIONS = new Set<string>(Object.values(TEMPLATE_RUNTIME_OPERATIONS));
const PRESET_OPERATIONS = new Set<string>(Object.values(PRESET_RUNTIME_OPERATIONS));
const QUEUE_OPERATIONS = new Set<string>(Object.values(QUEUE_RUNTIME_OPERATIONS));

export class BackgroundMessageRouter {
  readonly #control: ControlPlaneServer;
  readonly #tabs: TabRuntimeServer;
  readonly #runs: RunRuntimeServer | undefined;
  readonly #templates: TemplateRuntimeServer | undefined;
  readonly #presets: PresetRuntimeServer | undefined;
  readonly #queues: QueueRuntimeServer | undefined;

  constructor(control: ControlPlaneServer, tabs: TabRuntimeServer, runs?: RunRuntimeServer, templates?: TemplateRuntimeServer, presets?: PresetRuntimeServer, queues?: QueueRuntimeServer) {
    this.#control = control;
    this.#tabs = tabs;
    this.#runs = runs;
    this.#templates = templates;
    this.#presets = presets;
    this.#queues = queues;
  }

  async handle(raw: unknown, sender: RuntimeMessageSenderLike = {}): Promise<unknown> {
    const message = requireMessageEnvelope(raw);
    if (TAB_OPERATIONS.has(message.operation)) return await this.#tabs.handle(message, sender);
    if (RUN_OPERATIONS.has(message.operation)) {
      if (this.#runs === undefined) return await this.#control.handle(message);
      return await this.#runs.handle(message);
    }
    if (TEMPLATE_OPERATIONS.has(message.operation)) {
      if (this.#templates === undefined) return await this.#control.handle(message);
      return await this.#templates.handle(message);
    }
    if (PRESET_OPERATIONS.has(message.operation)) {
      if (this.#presets === undefined) return await this.#control.handle(message);
      return await this.#presets.handle(message);
    }
    if (QUEUE_OPERATIONS.has(message.operation)) {
      if (this.#queues === undefined) return await this.#control.handle(message);
      return await this.#queues.handle(message);
    }
    return await this.#control.handle(message);
  }
}
