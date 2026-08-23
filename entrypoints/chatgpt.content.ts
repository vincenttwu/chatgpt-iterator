import { browser } from 'wxt/browser';
import { BrowserChatGptDomEnvironment, ChatGptAdapter, ChatGptAdapterServer, type ChatGptAdapterSnapshot } from '../src/chatgpt/index.ts';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  runAt: 'document_idle',
  main() {
    const adapter = new ChatGptAdapter(new BrowserChatGptDomEnvironment(document, window));
    let latestSnapshot: ChatGptAdapterSnapshot = adapter.snapshot();
    const stopObservation = adapter.observe((observation) => { latestSnapshot = observation.snapshot; });
    const server = new ChatGptAdapterServer(adapter, () => latestSnapshot);

    browser.runtime.onMessage.addListener((message: unknown) => server.handle(message));
    window.addEventListener('pagehide', stopObservation, { once: true });
  },
});
