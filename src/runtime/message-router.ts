import { requireMessageEnvelope } from '../core/index.ts';
import { RUN_RUNTIME_OPERATIONS } from '../runs/types.ts';
import type { ControlPlaneServer } from '../control-plane/server.ts';
import { TAB_RUNTIME_OPERATIONS } from '../tabs/types.ts';
import { TEMPLATE_RUNTIME_OPERATIONS } from '../templates/types.ts';
import { PRESET_RUNTIME_OPERATIONS } from '../presets/types.ts';
import { QUEUE_RUNTIME_OPERATIONS } from '../queues/types.ts';
import { SETTINGS_RUNTIME_OPERATIONS } from '../settings/types.ts';
import { DIAGNOSTICS_RUNTIME_OPERATIONS } from '../diagnostics/types.ts';
import { HISTORY_RUNTIME_OPERATIONS } from '../history/types.ts';
import { PORTABILITY_RUNTIME_OPERATIONS } from '../portability/types.ts';
import type { DiagnosticsRuntimeServer } from './diagnostics-runtime-server.ts';
import type { HistoryRuntimeServer } from './history-runtime-server.ts';
import type { PortabilityRuntimeServer } from './portability-runtime-server.ts';
import type { RunRuntimeServer } from './run-runtime-server.ts';
import type { SettingsRuntimeServer } from './settings-runtime-server.ts';
import type { TemplateRuntimeServer } from './template-runtime-server.ts';
import type { PresetRuntimeServer } from './preset-runtime-server.ts';
import type { QueueRuntimeServer } from './queue-runtime-server.ts';
import type { RuntimeMessageSenderLike, TabRuntimeServer } from './tab-runtime-server.ts';

const TAB_OPERATIONS = new Set<string>(Object.values(TAB_RUNTIME_OPERATIONS));
const RUN_OPERATIONS = new Set<string>(Object.values(RUN_RUNTIME_OPERATIONS));
const TEMPLATE_OPERATIONS = new Set<string>(Object.values(TEMPLATE_RUNTIME_OPERATIONS));
const PRESET_OPERATIONS = new Set<string>(Object.values(PRESET_RUNTIME_OPERATIONS));
const QUEUE_OPERATIONS = new Set<string>(Object.values(QUEUE_RUNTIME_OPERATIONS));
const SETTINGS_OPERATIONS = new Set<string>(Object.values(SETTINGS_RUNTIME_OPERATIONS));
const DIAGNOSTICS_OPERATIONS = new Set<string>(Object.values(DIAGNOSTICS_RUNTIME_OPERATIONS));
const HISTORY_OPERATIONS = new Set<string>(Object.values(HISTORY_RUNTIME_OPERATIONS));
const PORTABILITY_OPERATIONS = new Set<string>(Object.values(PORTABILITY_RUNTIME_OPERATIONS));

export class BackgroundMessageRouter {
  readonly #control: ControlPlaneServer;
  readonly #tabs: TabRuntimeServer;
  readonly #runs: RunRuntimeServer | undefined;
  readonly #templates: TemplateRuntimeServer | undefined;
  readonly #presets: PresetRuntimeServer | undefined;
  readonly #queues: QueueRuntimeServer | undefined;
  readonly #settings: SettingsRuntimeServer | undefined;
  readonly #diagnostics: DiagnosticsRuntimeServer | undefined;
  readonly #history: HistoryRuntimeServer | undefined;
  readonly #portability: PortabilityRuntimeServer | undefined;

  constructor(control: ControlPlaneServer, tabs: TabRuntimeServer, runs?: RunRuntimeServer, templates?: TemplateRuntimeServer, presets?: PresetRuntimeServer, queues?: QueueRuntimeServer, settings?: SettingsRuntimeServer, diagnostics?: DiagnosticsRuntimeServer, history?: HistoryRuntimeServer, portability?: PortabilityRuntimeServer) {
    this.#control = control; this.#tabs = tabs; this.#runs = runs; this.#templates = templates; this.#presets = presets; this.#queues = queues; this.#settings = settings; this.#diagnostics = diagnostics; this.#history = history; this.#portability = portability;
  }

  async handle(raw: unknown, sender: RuntimeMessageSenderLike = {}): Promise<unknown> {
    const message = requireMessageEnvelope(raw);
    if (TAB_OPERATIONS.has(message.operation)) return await this.#tabs.handle(message, sender);
    if (RUN_OPERATIONS.has(message.operation)) return this.#runs === undefined ? await this.#control.handle(message) : await this.#runs.handle(message);
    if (TEMPLATE_OPERATIONS.has(message.operation)) return this.#templates === undefined ? await this.#control.handle(message) : await this.#templates.handle(message);
    if (PRESET_OPERATIONS.has(message.operation)) return this.#presets === undefined ? await this.#control.handle(message) : await this.#presets.handle(message);
    if (QUEUE_OPERATIONS.has(message.operation)) return this.#queues === undefined ? await this.#control.handle(message) : await this.#queues.handle(message);
    if (SETTINGS_OPERATIONS.has(message.operation)) return this.#settings === undefined ? await this.#control.handle(message) : await this.#settings.handle(message);
    if (DIAGNOSTICS_OPERATIONS.has(message.operation)) return this.#diagnostics === undefined ? await this.#control.handle(message) : await this.#diagnostics.handle(message);
    if (HISTORY_OPERATIONS.has(message.operation)) return this.#history === undefined ? await this.#control.handle(message) : await this.#history.handle(message);
    if (PORTABILITY_OPERATIONS.has(message.operation)) return this.#portability === undefined ? await this.#control.handle(message) : await this.#portability.handle(message);
    return await this.#control.handle(message);
  }
}
