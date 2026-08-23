import { browser } from 'wxt/browser';
import { ControlPlaneAuthority, ControlPlanePortHub, ControlPlaneServer } from '../src/control-plane/index.ts';
import { BackgroundMessageRouter, DiagnosticsRuntimeServer, HistoryRuntimeServer, PortabilityRuntimeServer, PresetRuntimeServer, QueueRuntimeServer, RunRuntimeServer, SettingsRuntimeServer, TabLifecycleCoordinator, TabRuntimeServer, TemplateRuntimeServer } from '../src/runtime/index.ts';
import { AutoDiscardGuardManager, ChatGptTabRegistry, type TabBrowserLike } from '../src/tabs/index.ts';
import { bootstrapApplicationPersistence, createChromeStorageTiers, restrictChromeStorageToTrustedContexts, type ChromeStorageLike, type PersistenceRuntime } from '../src/persistence/index.ts';
import {
  ChatGptObservationHub,
  ChatGptRunClient,
  DurableRunManager,
  DurableRunRepository,
  DurableRunScheduler,
  EventDrivenChatGptWaiter,
  RepeatRunCoordinator,
  isRunTerminal,
  type AlarmBrowserLike,
} from '../src/runs/index.ts';
import { TemplateService } from '../src/templates/index.ts';
import { PresetService } from '../src/presets/index.ts';
import { QueueService } from '../src/queues/index.ts';
import { SettingsService } from '../src/settings/index.ts';
import { RunHistoryService } from '../src/history/index.ts';
import { DiagnosticsService } from '../src/diagnostics/index.ts';
import { PortabilityService } from '../src/portability/index.ts';
import { ContractError, ERROR_CODES } from '../src/core/index.ts';

const workerStartedAt = new Date().toISOString();
const tabBrowser = browser.tabs as unknown as TabBrowserLike;
const chromeStorage = browser.storage as unknown as ChromeStorageLike;
const storageTiers = createChromeStorageTiers(chromeStorage);
const settingsService = new SettingsService(storageTiers.sync);
const authority = new ControlPlaneAuthority();
const controlServer = new ControlPlaneServer(authority);
const ports = new ControlPlanePortHub();
const tabs = new ChatGptTabRegistry(tabBrowser);
const observations = new ChatGptObservationHub();
const discardGuards = new AutoDiscardGuardManager(tabBrowser);
const tabServer = new TabRuntimeServer(tabs, (tabId, _windowId, snapshot) => observations.note(tabId, snapshot));
let persistencePromise: Promise<PersistenceRuntime> | undefined;
let runRuntimePromise: Promise<{ manager: DurableRunManager; coordinator: RepeatRunCoordinator }> | undefined;
let templateServicePromise: Promise<TemplateService> | undefined;
let presetServicePromise: Promise<PresetService> | undefined;
let queueServicePromise: Promise<QueueService> | undefined;
let historyServicePromise: Promise<RunHistoryService> | undefined;
let diagnosticsServicePromise: Promise<DiagnosticsService> | undefined;
let portabilityServicePromise: Promise<PortabilityService> | undefined;

const runServer = new RunRuntimeServer(
  async () => { if (runRuntimePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'run persistence is not initialized'); return (await runRuntimePromise).manager; },
  async () => { if (runRuntimePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'run execution is not initialized'); return (await runRuntimePromise).coordinator; },
  async () => { if (queueServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'queue persistence is not initialized'); return await queueServicePromise; },
);
const templateServer = new TemplateRuntimeServer(
  async () => { if (templateServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'template persistence is not initialized'); return await templateServicePromise; },
  () => ports.broadcast('template_changed'),
);
const presetServer = new PresetRuntimeServer(
  async () => { if (presetServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'preset persistence is not initialized'); return await presetServicePromise; },
  () => ports.broadcast('preset_changed'),
);
const queueServer = new QueueRuntimeServer(
  async () => { if (queueServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'queue persistence is not initialized'); return await queueServicePromise; },
  () => ports.broadcast('queue_changed'),
);
const settingsServer = new SettingsRuntimeServer(
  async () => settingsService,
  async (settings) => {
    ports.broadcast('settings_changed');
    if (historyServicePromise !== undefined) {
      const result = await (await historyServicePromise).enforceRetention(settings.historyLimit);
      if (result.removedRuns > 0) ports.broadcast('history_changed');
    }
  },
);
const historyServer = new HistoryRuntimeServer(
  async () => { if (historyServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'history persistence is not initialized'); return await historyServicePromise; },
  async () => settingsService,
  () => ports.broadcast('history_changed'),
);
const diagnosticsServer = new DiagnosticsRuntimeServer(async () => {
  if (diagnosticsServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'diagnostics runtime is not initialized');
  return await diagnosticsServicePromise;
});
const portabilityServer = new PortabilityRuntimeServer(
  async () => { if (portabilityServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'portability runtime is not initialized'); return await portabilityServicePromise; },
  () => { for (const reason of ['template_changed','preset_changed','queue_changed','settings_changed','history_changed'] as const) ports.broadcast(reason); },
);
const router = new BackgroundMessageRouter(controlServer, tabServer, runServer, templateServer, presetServer, queueServer, settingsServer, diagnosticsServer, historyServer, portabilityServer);
const lifecycle = new TabLifecycleCoordinator(tabBrowser, tabs, discardGuards, (error) => { console.error('chatgpt-iterator: tab lifecycle error', error); });

function reportRunError(error: unknown): void { console.error('chatgpt-iterator: run runtime error', error); }

async function pruneHistoryIfNeeded(): Promise<void> {
  if (historyServicePromise === undefined) return;
  const settings = await settingsService.get();
  const result = await (await historyServicePromise).enforceRetention(settings.historyLimit);
  if (result.removedRuns > 0) ports.broadcast('history_changed');
}

tabs.subscribe((snapshot) => {
  authority.setTabs(snapshot);
  ports.broadcast('tab_changed');
  if (runRuntimePromise !== undefined) {
    void runRuntimePromise.then(async ({ manager, coordinator }) => {
      await manager.reconcileTabs(snapshot);
      coordinator.recover(await manager.list());
    }).catch(reportRunError);
  }
});

export default defineBackground(() => {
  void restrictChromeStorageToTrustedContexts(chromeStorage).catch((error: unknown) => { console.error('chatgpt-iterator: failed to restrict extension storage access', error); });

  persistencePromise = bootstrapApplicationPersistence();
  templateServicePromise = persistencePromise.then((runtime) => new TemplateService(runtime.repositories));
  presetServicePromise = persistencePromise.then((runtime) => new PresetService(runtime.repositories));
  queueServicePromise = persistencePromise.then((runtime) => new QueueService(runtime.repositories));
  historyServicePromise = persistencePromise.then((runtime) => new RunHistoryService(runtime.repositories));
  portabilityServicePromise = persistencePromise.then((runtime) => new PortabilityService(runtime.repositories, settingsService, browser.runtime.getManifest().version));
  runRuntimePromise = persistencePromise.then(async (runtime) => {
    const manager = new DurableRunManager(new DurableRunRepository(runtime.repositories));
    manager.subscribe((snapshot) => {
      ports.broadcast('run_changed');
      if (isRunTerminal(snapshot.lifecycleState)) { ports.broadcast('history_changed'); void pruneHistoryIfNeeded().catch(reportRunError); }
    });
    const recovered = await manager.recoverWorker();
    const client = new ChatGptRunClient(tabBrowser);
    const waiter = new EventDrivenChatGptWaiter(client, observations);
    const scheduler = new DurableRunScheduler(browser.alarms as unknown as AlarmBrowserLike);
    const coordinator = new RepeatRunCoordinator(manager, client, waiter, scheduler, discardGuards);
    const settings = await settingsService.get();
    if (settings.recoveryPolicy === 'pause') {
      for (const snapshot of recovered) {
        if (snapshot.lifecycleState === 'ready' || snapshot.lifecycleState === 'paused' || isRunTerminal(snapshot.lifecycleState)) continue;
        await manager.pause(snapshot.id, snapshot.generation, manager.createCommandId());
      }
    } else {
      coordinator.recover(recovered);
    }
    return { manager, coordinator };
  });
  diagnosticsServicePromise = persistencePromise.then(async (runtime) => {
    const client = new ChatGptRunClient(tabBrowser);
    return new DiagnosticsService(runtime.repositories, {
      appVersion: browser.runtime.getManifest().version,
      workerStartedAt,
      connectedPanels: () => ports.size(),
      tabs: () => tabs.snapshot(),
      runs: async () => runRuntimePromise === undefined ? [] : await (await runRuntimePromise).manager.list(),
      adapterDiagnostics: async (tabId) => await client.diagnostics(tabId),
    });
  });

  void runRuntimePromise.catch((error: unknown) => { console.error('chatgpt-iterator: failed to initialize durable run runtime', error); });
  void templateServicePromise.catch((error: unknown) => { console.error('chatgpt-iterator: failed to initialize template runtime', error); });
  void presetServicePromise.catch((error: unknown) => { console.error('chatgpt-iterator: failed to initialize preset runtime', error); });
  void queueServicePromise.catch((error: unknown) => { console.error('chatgpt-iterator: failed to initialize queue runtime', error); });
  void historyServicePromise.catch((error: unknown) => { console.error('chatgpt-iterator: failed to initialize history runtime', error); });
  void diagnosticsServicePromise.catch((error: unknown) => { console.error('chatgpt-iterator: failed to initialize diagnostics runtime', error); });
  void portabilityServicePromise.catch((error: unknown) => { console.error('chatgpt-iterator: failed to initialize portability runtime', error); });

  if (browser.sidePanel?.setPanelBehavior) {
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => { console.error('chatgpt-iterator: failed to configure Side Panel action behavior', error); });
  }

  browser.runtime.onMessage.addListener((message: unknown, sender) => router.handle(message, sender));
  browser.runtime.onConnect.addListener((port) => { ports.attach(port); });
  lifecycle.start();
});
