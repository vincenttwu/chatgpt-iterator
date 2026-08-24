import { ContractError, ERROR_CODES, createFailureResponse, requireMessageEnvelope, type RequestEnvelope } from '../core/index.ts';
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
import { INPAGE_CONTROLLER_OPERATIONS } from '../presentation/inpage-controller.ts';
import type { DiagnosticsRuntimeServer } from './diagnostics-runtime-server.ts';
import type { HistoryRuntimeServer } from './history-runtime-server.ts';
import type { InPageControllerRuntimeServer } from './inpage-controller-runtime-server.ts';
import type { PortabilityRuntimeServer } from './portability-runtime-server.ts';
import type { RunRuntimeServer } from './run-runtime-server.ts';
import type { SettingsRuntimeServer } from './settings-runtime-server.ts';
import type { TemplateRuntimeServer } from './template-runtime-server.ts';
import type { PresetRuntimeServer } from './preset-runtime-server.ts';
import type { QueueRuntimeServer } from './queue-runtime-server.ts';
import type { TabRuntimeServer } from './tab-runtime-server.ts';
import { resolveRuntimeCaller, type RuntimeMessageSenderLike } from './caller-context.ts';

const TAB_OPERATIONS = new Set<string>(Object.values(TAB_RUNTIME_OPERATIONS));
const RUN_OPERATIONS = new Set<string>(Object.values(RUN_RUNTIME_OPERATIONS));
const TEMPLATE_OPERATIONS = new Set<string>(Object.values(TEMPLATE_RUNTIME_OPERATIONS));
const PRESET_OPERATIONS = new Set<string>(Object.values(PRESET_RUNTIME_OPERATIONS));
const QUEUE_OPERATIONS = new Set<string>(Object.values(QUEUE_RUNTIME_OPERATIONS));
const SETTINGS_OPERATIONS = new Set<string>(Object.values(SETTINGS_RUNTIME_OPERATIONS));
const DIAGNOSTICS_OPERATIONS = new Set<string>(Object.values(DIAGNOSTICS_RUNTIME_OPERATIONS));
const HISTORY_OPERATIONS = new Set<string>(Object.values(HISTORY_RUNTIME_OPERATIONS));
const PORTABILITY_OPERATIONS = new Set<string>(Object.values(PORTABILITY_RUNTIME_OPERATIONS));
const INPAGE_OPERATIONS = new Set<string>(Object.values(INPAGE_CONTROLLER_OPERATIONS));
const CONTENT_ENABLED_OPERATIONS = new Set<string>([TAB_RUNTIME_OPERATIONS.adapterState, ...INPAGE_OPERATIONS]);

function requireAuthorizedCaller(request: RequestEnvelope, sender: RuntimeMessageSenderLike, extensionId: string) {
  if (request.target !== 'background') throw new ContractError(ERROR_CODES.invalidMessage, 'background router accepts background-targeted requests only');
  const caller = resolveRuntimeCaller(sender, extensionId);
  if (caller.kind === 'sidepanel') {
    if (request.source !== 'sidepanel') throw new ContractError(ERROR_CODES.invalidMessage, 'Side Panel caller source metadata does not match verified sender context');
    if (request.operation === TAB_RUNTIME_OPERATIONS.adapterState) throw new ContractError(ERROR_CODES.invalidMessage, 'Side Panel cannot publish content adapter state');
    return caller;
  }
  if (request.source !== 'content') throw new ContractError(ERROR_CODES.invalidMessage, 'ChatGPT content caller source metadata does not match verified sender context');
  if (!CONTENT_ENABLED_OPERATIONS.has(request.operation)) throw new ContractError(ERROR_CODES.invalidMessage, 'ChatGPT content caller is not authorized for this operation');
  return caller;
}

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
  readonly #inpage: InPageControllerRuntimeServer | undefined;
  readonly #extensionId: string;

  constructor(
    control: ControlPlaneServer,
    tabs: TabRuntimeServer,
    runs?: RunRuntimeServer,
    templates?: TemplateRuntimeServer,
    presets?: PresetRuntimeServer,
    queues?: QueueRuntimeServer,
    settings?: SettingsRuntimeServer,
    diagnostics?: DiagnosticsRuntimeServer,
    history?: HistoryRuntimeServer,
    portability?: PortabilityRuntimeServer,
    extensionId = 'chatgpt-iterator-test-extension',
    inpage?: InPageControllerRuntimeServer,
  ) {
    this.#control = control;
    this.#tabs = tabs;
    this.#runs = runs;
    this.#templates = templates;
    this.#presets = presets;
    this.#queues = queues;
    this.#settings = settings;
    this.#diagnostics = diagnostics;
    this.#history = history;
    this.#portability = portability;
    this.#extensionId = extensionId;
    this.#inpage = inpage;
  }

  async handle(raw: unknown, sender: RuntimeMessageSenderLike = {}): Promise<unknown> {
    const message = requireMessageEnvelope(raw);
    if (message.kind !== 'request') throw new ContractError(ERROR_CODES.invalidMessage, 'background router accepts request envelopes only');
    try {
      const caller = requireAuthorizedCaller(message, sender, this.#extensionId);
      if (TAB_OPERATIONS.has(message.operation)) return await this.#tabs.handle(message, sender);
      if (RUN_OPERATIONS.has(message.operation)) return this.#runs === undefined ? await this.#control.handle(message) : await this.#runs.handle(message);
      if (TEMPLATE_OPERATIONS.has(message.operation)) return this.#templates === undefined ? await this.#control.handle(message) : await this.#templates.handle(message);
      if (PRESET_OPERATIONS.has(message.operation)) return this.#presets === undefined ? await this.#control.handle(message) : await this.#presets.handle(message);
      if (QUEUE_OPERATIONS.has(message.operation)) return this.#queues === undefined ? await this.#control.handle(message) : await this.#queues.handle(message);
      if (SETTINGS_OPERATIONS.has(message.operation)) return this.#settings === undefined ? await this.#control.handle(message) : await this.#settings.handle(message);
      if (DIAGNOSTICS_OPERATIONS.has(message.operation)) return this.#diagnostics === undefined ? await this.#control.handle(message) : await this.#diagnostics.handle(message);
      if (HISTORY_OPERATIONS.has(message.operation)) return this.#history === undefined ? await this.#control.handle(message) : await this.#history.handle(message);
      if (PORTABILITY_OPERATIONS.has(message.operation)) return this.#portability === undefined ? await this.#control.handle(message) : await this.#portability.handle(message);
      if (INPAGE_OPERATIONS.has(message.operation)) {
        if (this.#inpage === undefined) throw new ContractError(ERROR_CODES.unavailable, 'in-page controller runtime is not initialized');
        return await this.#inpage.handle(message, caller);
      }
      return await this.#control.handle(message);
    } catch (error) {
      return createFailureResponse(message, error);
    }
  }
}
