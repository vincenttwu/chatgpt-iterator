import { freezeJsonValue } from '../core/json.ts';
import type { ChatGptAdapterDiagnostics, ChatGptAdapterSnapshot, ChatGptClickResult, ChatGptObservation, ChatGptSendResult, SelectorHealth } from './types.ts';
import { CHATGPT_ADAPTER_SCHEMA_VERSION } from './types.ts';
import { createAssistantFingerprint } from './fingerprint.ts';
import { CHATGPT_ADAPTER_ERROR_CODES, ChatGptAdapterError } from './errors.ts';
import type { ChatGptDomEnvironment, DomHandle } from './dom-environment.ts';
import { CHATGPT_SELECTOR_REGISTRY, CONTINUE_TEXT_PATTERN, SEND_ARIA_PATTERN, STOP_ARIA_PATTERN, type SelectorDefinition } from './selectors.ts';

interface Match {
  readonly handle: DomHandle;
  readonly matchedBy: string;
}

function normalizeText(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
function boundedText(value: string, limit = 512): string { return normalizeText(value).slice(0, limit); }

export class ChatGptAdapter {
  readonly #dom: ChatGptDomEnvironment;

  constructor(dom: ChatGptDomEnvironment) { this.#dom = dom; }

  snapshot(): ChatGptAdapterSnapshot {
    const composer = this.#findComposer();
    const send = this.#findSend();
    const stop = this.#findStop();
    const continueButton = this.#findContinue();
    const assistantMessages = this.#visibleAll(CHATGPT_SELECTOR_REGISTRY.assistantMessages.candidates[0]!);
    const latest = assistantMessages.at(-1);
    const latestText = latest === undefined ? '' : normalizeText(this.#dom.readText(latest));
    const pageAlert = this.#pageAlert();
    const assistantFingerprint = createAssistantFingerprint(assistantMessages.length, latestText);

    return freezeJsonValue({
      schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
      ready: composer !== null,
      busy: stop !== null,
      composerPresent: composer !== null,
      composerHasDraft: composer !== null && this.#dom.readComposer(composer.handle).trim().length !== 0,
      sendAvailable: send !== null && !this.#dom.isDisabled(send.handle),
      continueAvailable: continueButton !== null && !this.#dom.isDisabled(continueButton.handle),
      stopAvailable: stop !== null && !this.#dom.isDisabled(stop.handle),
      assistantFingerprint,
      assistantMessageCount: assistantMessages.length,
      pageAlert,
    });
  }

  diagnostics(): ChatGptAdapterDiagnostics {
    const composer = this.#findComposer();
    const send = this.#findSend();
    const stop = this.#findStop();
    const continueButton = this.#findContinue();
    const assistantMessages = this.#visibleAll(CHATGPT_SELECTOR_REGISTRY.assistantMessages.candidates[0]!);
    const alert = this.#findFirst(CHATGPT_SELECTOR_REGISTRY.pageAlert);
    const pageAlert = alert === null ? null : boundedText(this.#dom.readText(alert.handle));

    const capabilities: SelectorHealth[] = [
      this.#health(CHATGPT_SELECTOR_REGISTRY.composer, composer, composer === null ? 'absent' : 'ready', composer === null ? 0 : 1),
      this.#health(CHATGPT_SELECTOR_REGISTRY.assistantMessages, assistantMessages.length === 0 ? null : { handle: assistantMessages[0]!, matchedBy: CHATGPT_SELECTOR_REGISTRY.assistantMessages.candidates[0]! }, assistantMessages.length === 0 ? 'empty' : 'ready', assistantMessages.length),
      this.#health(CHATGPT_SELECTOR_REGISTRY.send, send, send === null ? 'absent' : this.#dom.isDisabled(send.handle) ? 'disabled' : 'ready', send === null ? 0 : 1),
      this.#health(CHATGPT_SELECTOR_REGISTRY.stop, stop, stop === null ? 'absent' : this.#dom.isDisabled(stop.handle) ? 'disabled' : 'ready', stop === null ? 0 : 1),
      this.#health(CHATGPT_SELECTOR_REGISTRY.continue, continueButton, continueButton === null ? 'absent' : this.#dom.isDisabled(continueButton.handle) ? 'disabled' : 'ready', continueButton === null ? 0 : 1),
      this.#health(CHATGPT_SELECTOR_REGISTRY.pageAlert, alert, alert === null ? 'absent' : 'ready', alert === null ? 0 : 1),
    ];

    return freezeJsonValue({
      schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
      status: composer === null ? 'unavailable' : pageAlert === null ? 'ready' : 'degraded',
      capabilities,
      pageAlert,
    });
  }

  async send(message: string, timeoutMs = 5_000, expectedAssistantBaselineFingerprint?: string): Promise<ChatGptSendResult> {
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.invalidCommand, 'Message must be non-empty');
    }
    const composer = this.#findComposer();
    if (composer === null) throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.composerMissing, 'ChatGPT composer was not found');
    if (this.#dom.readComposer(composer.handle).trim().length !== 0) {
      throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.draftNotEmpty, 'Composer contains unsent text');
    }

    const assistantBaselineFingerprint = this.snapshot().assistantFingerprint;
    if (expectedAssistantBaselineFingerprint !== undefined && assistantBaselineFingerprint !== expectedAssistantBaselineFingerprint) {
      throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.responseBaselineChanged, 'Assistant response baseline changed before send');
    }
    this.#dom.writeComposer(composer.handle, message);
    const send = await this.#waitForEnabled(() => this.#findSend(), timeoutMs);
    if (send === null) throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.sendUnavailable, 'Enabled ChatGPT send button was not found');
    const beforeClick = this.snapshot();
    if (beforeClick.assistantFingerprint !== assistantBaselineFingerprint || beforeClick.busy) {
      throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.responseBaselineChanged, 'Conversation changed before send click');
    }
    this.#dom.click(send.handle);
    return freezeJsonValue({ schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION, status: 'sent' as const, assistantBaselineFingerprint });
  }

  continueResponse(): ChatGptClickResult { return this.#clickIfAvailable(this.#findContinue()); }
  stopResponse(): ChatGptClickResult { return this.#clickIfAvailable(this.#findStop()); }
  scrollToBottom(): void { this.#dom.scrollToBottom(); }

  observe(listener: (observation: ChatGptObservation) => void): () => void {
    let revision = 0;
    let queued = false;
    let previousFingerprint = '';
    let stopped = false;

    const emit = (reason: ChatGptObservation['reason']) => {
      if (stopped) return;
      const snapshot = this.snapshot();
      const fingerprint = JSON.stringify(snapshot);
      if (reason !== 'initial' && fingerprint === previousFingerprint) return;
      previousFingerprint = fingerprint;
      revision += 1;
      listener(freezeJsonValue({
        schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
        revision,
        reason,
        observedAt: this.#dom.isoNow(),
        snapshot,
      }));
    };

    emit('initial');
    const disconnect = this.#dom.observe(() => {
      if (queued || stopped) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        emit('dom_mutation');
      });
    });

    return () => { stopped = true; disconnect(); };
  }

  #clickIfAvailable(match: Match | null): ChatGptClickResult {
    if (match === null || this.#dom.isDisabled(match.handle)) {
      return freezeJsonValue({ schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION, clicked: false });
    }
    this.#dom.click(match.handle);
    return freezeJsonValue({ schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION, clicked: true });
  }

  #findComposer(): Match | null { return this.#findFirst(CHATGPT_SELECTOR_REGISTRY.composer); }

  #findSend(): Match | null {
    const exact = this.#findFirstCandidates(CHATGPT_SELECTOR_REGISTRY.send.candidates);
    if (exact !== null) return exact;
    for (const button of this.#dom.queryAll(CHATGPT_SELECTOR_REGISTRY.send.fallback!)) {
      if (!this.#dom.isVisible(button)) continue;
      if (SEND_ARIA_PATTERN.test(this.#dom.getAttribute(button, 'aria-label') ?? '')) return { handle: button, matchedBy: 'aria-label' };
    }
    return null;
  }

  #findStop(): Match | null {
    const exact = this.#findFirstCandidates(CHATGPT_SELECTOR_REGISTRY.stop.candidates);
    if (exact !== null) return exact;
    for (const button of this.#dom.queryAll(CHATGPT_SELECTOR_REGISTRY.stop.fallback!)) {
      if (!this.#dom.isVisible(button)) continue;
      if (STOP_ARIA_PATTERN.test(this.#dom.getAttribute(button, 'aria-label') ?? '')) return { handle: button, matchedBy: 'aria-label' };
    }
    return null;
  }

  #findContinue(): Match | null {
    for (const button of this.#dom.queryAll(CHATGPT_SELECTOR_REGISTRY.continue.fallback!)) {
      if (!this.#dom.isVisible(button)) continue;
      if (CONTINUE_TEXT_PATTERN.test(this.#dom.readText(button))) return { handle: button, matchedBy: 'button-text' };
    }
    return null;
  }

  #pageAlert(): string | null {
    const alert = this.#findFirst(CHATGPT_SELECTOR_REGISTRY.pageAlert);
    if (alert === null) return null;
    const text = boundedText(this.#dom.readText(alert.handle));
    return text.length === 0 ? null : text;
  }

  #findFirst(definition: SelectorDefinition): Match | null { return this.#findFirstCandidates(definition.candidates); }

  #findFirstCandidates(candidates: readonly string[]): Match | null {
    for (const selector of candidates) {
      const handle = this.#dom.queryOne(selector);
      if (handle !== null && this.#dom.isVisible(handle)) return { handle, matchedBy: selector };
    }
    return null;
  }

  #visibleAll(selector: string): readonly DomHandle[] { return this.#dom.queryAll(selector).filter((handle) => this.#dom.isVisible(handle)); }

  #health(definition: SelectorDefinition, match: Match | null, status: SelectorHealth['status'], count: number): SelectorHealth {
    return freezeJsonValue({ key: definition.key, requirement: definition.requirement, status, matchedBy: match?.matchedBy ?? null, count });
  }

  async #waitForEnabled(resolve: () => Match | null, timeoutMs: number): Promise<Match | null> {
    const immediate = resolve();
    if (immediate !== null && !this.#dom.isDisabled(immediate.handle)) return immediate;

    return new Promise((settle) => {
      let settled = false;
      let disconnect: () => void = () => {};
      let timer = 0;
      const finish = (value: Match | null) => {
        if (settled) return;
        settled = true;
        disconnect();
        clearTimeout(timer);
        settle(value);
      };
      const inspect = () => {
        const candidate = resolve();
        if (candidate !== null && !this.#dom.isDisabled(candidate.handle)) finish(candidate);
      };
      disconnect = this.#dom.observe(inspect);
      timer = setTimeout(() => finish(null), Math.max(1, timeoutMs));
      inspect();
    });
  }
}
