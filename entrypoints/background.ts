import { browser } from 'wxt/browser';
import { ControlPlaneAuthority, ControlPlanePortHub, ControlPlaneServer } from '../src/control-plane/index.ts';
import { BackgroundMessageRouter, TabLifecycleCoordinator, TabRuntimeServer } from '../src/runtime/index.ts';
import { AutoDiscardGuardManager, ChatGptTabRegistry, type TabBrowserLike } from '../src/tabs/index.ts';

const tabBrowser = browser.tabs as unknown as TabBrowserLike;
const authority = new ControlPlaneAuthority();
const controlServer = new ControlPlaneServer(authority);
const ports = new ControlPlanePortHub();
const tabs = new ChatGptTabRegistry(tabBrowser);
const discardGuards = new AutoDiscardGuardManager(tabBrowser);
const tabServer = new TabRuntimeServer(tabs);
const router = new BackgroundMessageRouter(controlServer, tabServer);
const lifecycle = new TabLifecycleCoordinator(tabBrowser, tabs, discardGuards, (error) => {
  console.error('chatgpt-iterator: tab lifecycle error', error);
});

tabs.subscribe((snapshot) => {
  authority.setTabs(snapshot);
  ports.broadcast('authority_changed');
});

export default defineBackground(() => {
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
