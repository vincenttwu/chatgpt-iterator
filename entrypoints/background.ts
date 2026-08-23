import { browser } from 'wxt/browser';

export default defineBackground(() => {
  if (!browser.sidePanel?.setPanelBehavior) return;

  void browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => {
      console.error('chatgpt-iterator: failed to configure Side Panel action behavior', error);
    });
});
