import { browser } from 'wxt/browser';
import { ControlPlaneAuthority, ControlPlanePortHub, ControlPlaneServer } from '../src/control-plane/index.ts';
import { BackgroundMessageRouter, RunRuntimeServer, TabLifecycleCoordinator, TabRuntimeServer } from '../src/runtime/index.ts';
import { AutoDiscardGuardManager, ChatGptTabRegistry, type TabBrowserLike } from '../src/tabs/index.ts';
import { bootstrapApplicationPersistence, restrictChromeStorageToTrustedContexts, type ChromeStorageLike } from '../src/persistence/index.ts';
import { DurableRunManager, DurableRunRepository } from '../src/runs/index.ts';
import { ContractError, ERROR_CODES } from '../src/core/index.ts';

const tabBrowser = browser.tabs as unknown as TabBrowserLike;
const authority = new ControlPlaneAuthority();
const controlServer = new ControlPlaneServer(authority);
const ports = new ControlPlanePortHub();
const tabs = new ChatGptTabRegistry(tabBrowser);
const discardGuards = new AutoDiscardGuardManager(tabBrowser);
const tabServer = new TabRuntimeServer(tabs);
let runManagerPromise: Promise<DurableRunManager> | undefined;
const runServer = new RunRuntimeServer(async () => {
  if (runManagerPromise === undefined) throw new ContractError(ERROR_CODES.unavailable, 'run persistence is not initialized');
  return await runManagerPromise;
});
const router = new BackgroundMessageRouter(controlServer, tabServer, runServer);
const lifecycle = new TabLifecycleCoordinator(tabBrowser, tabs, discardGuards, (error) => {
  console.error('chatgpt-iterator: tab lifecycle error', error);
});

function reportRunError(error: unknown): void {
  console.error('chatgpt-iterator: run runtime error', error);
}

tabs.subscribe((snapshot) => {
  authority.setTabs(snapshot);
  ports.broadcast('authority_changed');
  if (runManagerPromise !== undefined) void runManagerPromise.then((manager) => manager.reconcileTabs(snapshot)).catch(reportRunError);
});

export default defineBackground(() => {
  void restrictChromeStorageToTrustedContexts(browser.storage as unknown as ChromeStorageLike).catch((error: unknown) => {
    console.error('chatgpt-iterator: failed to restrict extension storage access', error);
  });

  runManagerPromise = bootstrapApplicationPersistence().then(async (runtime) => {
    const manager = new DurableRunManager(new DurableRunRepository(runtime.repositories));
    await manager.recoverWorker();
    return manager;
  });
  void runManagerPromise.catch((error: unknown) => {
    console.error('chatgpt-iterator: failed to initialize durable run runtime', error);
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
