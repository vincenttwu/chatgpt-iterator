import { browser } from 'wxt/browser';
import { createRequest } from '../src/core/index.ts';
import { TAB_RUNTIME_OPERATIONS } from '../src/tabs/types.ts';
import { BrowserChatGptDomEnvironment, ChatGptAdapter, ChatGptAdapterServer, type ChatGptAdapterSnapshot } from '../src/chatgpt/index.ts';
import {
  createInPageControllerCopy,
  InPageControllerClient,
  InPageRunControllerView,
  isInPageControllerInvalidation,
  type InPageControllerSnapshot,
} from '../src/presentation/index.ts';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  runAt: 'document_idle',
  main() {
    const adapter = new ChatGptAdapter(new BrowserChatGptDomEnvironment(document, window));
    let latestSnapshot: ChatGptAdapterSnapshot = adapter.snapshot();
    let adapterStateSequence = 0;
    let adapterStateFingerprint = '';
    const publishAdapterState = (snapshot: ChatGptAdapterSnapshot) => {
      const fingerprint = JSON.stringify({ ready: snapshot.ready, busy: snapshot.busy, composerHasDraft: snapshot.composerHasDraft, sendAvailable: snapshot.sendAvailable, continueAvailable: snapshot.continueAvailable, stopAvailable: snapshot.stopAvailable, assistantFingerprint: snapshot.assistantFingerprint, assistantMessageCount: snapshot.assistantMessageCount, pageAlert: snapshot.pageAlert, conversation: snapshot.conversation });
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

    const controllerClient = new InPageControllerClient(browser.runtime);
    const controllerCopy = createInPageControllerCopy((key, fallback) => browser.i18n.getMessage(key) || fallback);
    let controllerView: InPageRunControllerView;
    let refreshActive = false;
    let refreshAgain = false;
    let stopped = false;

    const apply = (promise: Promise<InPageControllerSnapshot>) => {
      void promise.then((snapshot) => controllerView.update(snapshot)).catch((error: unknown) => controllerView.showError(error instanceof Error ? error.message : String(error)));
    };
    const refreshController = () => {
      if (stopped) return;
      if (refreshActive) { refreshAgain=true; return; }
      refreshActive=true;
      void controllerClient.status().then((snapshot) => controllerView.update(snapshot)).catch((error: unknown) => controllerView.showError(error instanceof Error ? error.message : String(error))).finally(() => {
        refreshActive=false;
        if (refreshAgain) { refreshAgain=false; queueMicrotask(refreshController); }
      });
    };

    controllerView = new InPageRunControllerView(document, window, controllerCopy, {
      setCollapsed:(collapsed) => apply(controllerClient.setCollapsed(collapsed)),
      pause:(runId,generation) => apply(controllerClient.pause(runId,generation)),
      resume:(runId,generation) => apply(controllerClient.resume(runId,generation)),
      stop:(runId,generation) => apply(controllerClient.stop(runId,generation)),
      openSidePanel:() => { void controllerClient.openPanel().catch((error: unknown) => controllerView.showError(error instanceof Error ? error.message : String(error))); },
    });

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isInPageControllerInvalidation(message)) { queueMicrotask(refreshController); return undefined; }
      return server.handle(message);
    });
    refreshController();
    const startupRetry = window.setTimeout(refreshController, 750);
    window.addEventListener('pagehide', () => {
      stopped=true;
      window.clearTimeout(startupRetry);
      stopObservation();
      controllerView.destroy();
    }, { once:true });
  },
});
