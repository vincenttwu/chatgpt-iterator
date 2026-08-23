import { browser } from 'wxt/browser';
import { createRequest } from '../src/core/index.ts';
import { TAB_RUNTIME_OPERATIONS } from '../src/tabs/types.ts';
import { BrowserChatGptDomEnvironment, ChatGptAdapter, ChatGptAdapterServer, type ChatGptAdapterSnapshot } from '../src/chatgpt/index.ts';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  runAt: 'document_idle',
  main() {
    const adapter = new ChatGptAdapter(new BrowserChatGptDomEnvironment(document, window));
    let latestSnapshot: ChatGptAdapterSnapshot = adapter.snapshot();
    let adapterStateSequence = 0;
    let adapterStateFingerprint = '';
    const publishAdapterState = (snapshot: ChatGptAdapterSnapshot) => {
      const fingerprint = JSON.stringify({ ready: snapshot.ready, busy: snapshot.busy, composerDraft: snapshot.composerDraft, sendAvailable: snapshot.sendAvailable, continueAvailable: snapshot.continueAvailable, stopAvailable: snapshot.stopAvailable, assistantSignature: snapshot.assistantSignature, assistantMessageCount: snapshot.assistantMessageCount, pageAlert: snapshot.pageAlert });
      if (fingerprint === adapterStateFingerprint) return;
      adapterStateFingerprint = fingerprint;
      adapterStateSequence += 1;
      void browser.runtime.sendMessage(createRequest({
        requestSequence: adapterStateSequence,
        intent: 'command',
        source: 'content',
        target: 'background',
        operation: TAB_RUNTIME_OPERATIONS.adapterState,
        payload: { snapshot },
      })).catch(() => undefined);
    };
    const stopObservation = adapter.observe((observation) => {
      latestSnapshot = observation.snapshot;
      publishAdapterState(latestSnapshot);
    });
    const server = new ChatGptAdapterServer(adapter, () => latestSnapshot);

    browser.runtime.onMessage.addListener((message: unknown) => server.handle(message));
    window.addEventListener('pagehide', stopObservation, { once: true });
  },
});
