import { browser } from 'wxt/browser';
import { ControlPlaneAuthority, ControlPlanePortHub, ControlPlaneServer } from '../src/control-plane/index.ts';
import { BackgroundMessageRouter, PresetRuntimeServer, QueueRuntimeServer, RunRuntimeServer, TabLifecycleCoordinator, TabRuntimeServer, TemplateRuntimeServer } from '../src/runtime/index.ts';
import { AutoDiscardGuardManager, ChatGptTabRegistry, type TabBrowserLike } from '../src/tabs/index.ts';
import { bootstrapApplicationPersistence, restrictChromeStorageToTrustedContexts, type ChromeStorageLike, type PersistenceRuntime } from '../src/persistence/index.ts';
import {
  ChatGptObservationHub,
  ChatGptRunClient,
  DurableRunManager,
  DurableRunRepository,
  DurableRunScheduler,
  EventDrivenChatGptWaiter,
  RepeatRunCoordinator,
  type AlarmBrowserLike,
} from '../src/runs/index.ts';
import { TemplateService } from '../src/templates/index.ts';
import { PresetService } from '../src/presets/index.ts';
import { QueueService } from '../src/queues/index.ts';
import { ContractError, ERROR_CODES } from '../src/core/index.ts';

const tabBrowser = browser.tabs as unknown as TabBrowserLike;
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
const runServer = new RunRuntimeServer(
  async () => {
    if (runRuntimePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'run persistence is not initialized');
    return (await runRuntimePromise).manager;
  },
  async () => {
    if (runRuntimePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'run execution is not initialized');
    return (await runRuntimePromise).coordinator;
  },
  async () => {
    if (queueServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'queue persistence is not initialized');
    return await queueServicePromise;
  },
);
const templateServer = new TemplateRuntimeServer(
  async () => {
    if (templateServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'template persistence is not initialized');
    return await templateServicePromise;
  },
  () => ports.broadcast('template_changed'),
);
const presetServer = new PresetRuntimeServer(
  async () => {
    if (presetServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'preset persistence is not initialized');
    return await presetServicePromise;
  },
  () => ports.broadcast('preset_changed'),
);
const queueServer = new QueueRuntimeServer(
  async () => {
    if (queueServicePromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'queue persistence is not initialized');
    return await queueServicePromise;
  },
  () => ports.broadcast('queue_changed'),
);
const router = new BackgroundMessageRouter(controlServer, tabServer, runServer, templateServer, presetServer, queueServer);
const lifecycle = new TabLifecycleCoordinator(tabBrowser, tabs, discardGuards, (error) => {
  console.error('chatgpt-iterator: tab lifecycle error', error);
});

function reportRunError(error: unknown): void {
  console.error('chatgpt-iterator: run runtime error', error);
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
  void restrictChromeStorageToTrustedContexts(browser.storage as unknown as ChromeStorageLike).catch((error: unknown) => {
    console.error('chatgpt-iterator: failed to restrict extension storage access', error);
  });

  persistencePromise = bootstrapApplicationPersistence();
  templateServicePromise = persistencePromise.then((runtime) => new TemplateService(runtime.repositories));
  presetServicePromise = persistencePromise.then((runtime) => new PresetService(runtime.repositories));
  queueServicePromise = persistencePromise.then((runtime) => new QueueService(runtime.repositories));
  runRuntimePromise = persistencePromise.then(async (runtime) => {
    const manager = new DurableRunManager(new DurableRunRepository(runtime.repositories));
    manager.subscribe(() => ports.broadcast('run_changed'));
    const recovered = await manager.recoverWorker();
    const client = new ChatGptRunClient(tabBrowser);
    const waiter = new EventDrivenChatGptWaiter(client, observations);
    const scheduler = new DurableRunScheduler(browser.alarms as unknown as AlarmBrowserLike);
    const coordinator = new RepeatRunCoordinator(manager, client, waiter, scheduler, discardGuards);
    coordinator.recover(recovered);
    return { manager, coordinator };
  });
  void runRuntimePromise.catch((error: unknown) => {
    console.error('chatgpt-iterator: failed to initialize durable run runtime', error);
  });
  void templateServicePromise.catch((error: unknown) => {
    console.error('chatgpt-iterator: failed to initialize template runtime', error);
  });
  void presetServicePromise.catch((error: unknown) => {
    console.error('chatgpt-iterator: failed to initialize preset runtime', error);
  });
  void queueServicePromise.catch((error: unknown) => {
    console.error('chatgpt-iterator: failed to initialize queue runtime', error);
  });

  if (browser.sidePanel?.setPanelBehavior) {
    void browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: unknown) => {
        console.error('chatgpt-iterator: failed to configure Side Panel action behavior', error);
      });
  }

  browser.runtime.onMessage.addListener((message: unknown, sender) => router.handle(message, sender));
  browser.runtime.onConnect.addListener((port) => { ports.attach(port); });
  lifecycle.start();
});
