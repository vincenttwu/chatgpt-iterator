import { browser } from 'wxt/browser';
import { ControlPlaneAuthority, ControlPlanePortHub, ControlPlaneServer } from '../src/control-plane/index.ts';

const authority = new ControlPlaneAuthority();
const server = new ControlPlaneServer(authority);
const ports = new ControlPlanePortHub();

export default defineBackground(() => {
  if (browser.sidePanel?.setPanelBehavior) {
    void browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: unknown) => {
        console.error('chatgpt-iterator: failed to configure Side Panel action behavior', error);
      });
  }

  browser.runtime.onMessage.addListener((message: unknown) => server.handle(message));
  browser.runtime.onConnect.addListener((port) => { ports.attach(port); });
});
