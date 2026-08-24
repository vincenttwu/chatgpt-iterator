import { freezeJsonValue } from '../core/json.ts';
import type { ChatGptAdapterDiagnostics, ChatGptAdapterSnapshot, ChatGptClickResult, ChatGptConversationContext, ChatGptDegradationCode, ChatGptObservation, ChatGptSendResult, SelectorHealth } from './types.ts';
import { CHATGPT_ADAPTER_SCHEMA_VERSION, CHATGPT_STREAM_OBSERVATION_MIN_INTERVAL_MS } from './types.ts';
import { createAssistantFingerprint } from './fingerprint.ts';
import { conversationContextFromUrl, sameConversationContext } from './conversation.ts';
import { CHATGPT_ADAPTER_ERROR_CODES, ChatGptAdapterError } from './errors.ts';
import type { ChatGptDomEnvironment, DomHandle } from './dom-environment.ts';
import { CHATGPT_SELECTOR_REGISTRY, CONTINUE_TEXT_PATTERN, RATE_LIMIT_ALERT_PATTERN, SEND_ARIA_PATTERN, STOP_ARIA_PATTERN, VOICE_ARIA_PATTERN, type SelectorDefinition } from './selectors.ts';

interface Match {
  readonly handle: DomHandle;
  readonly matchedBy: string;
}

interface StructuralPreflight {
  readonly composer: Match | null;
  readonly composerCount: number;
  readonly conversation: ChatGptConversationContext;
  readonly pageAlert: string | null;
  readonly degradationCodes: ChatGptDegradationCode[];
}

function normalizeText(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
function boundedText(value: string, limit = 512): string { return normalizeText(value).slice(0, limit); }
function uniqueCodes(values: readonly ChatGptDegradationCode[]): ChatGptDegradationCode[] { return [...new Set(values)]; }

function observationSemanticFingerprint(snapshot: ChatGptAdapterSnapshot): string {
  return JSON.stringify({
    ready: snapshot.ready,
    busy: snapshot.busy,
    composerPresent: snapshot.composerPresent,
    composerHasDraft: snapshot.composerHasDraft,
    sendAvailable: snapshot.sendAvailable,
    continueAvailable: snapshot.continueAvailable,
    stopAvailable: snapshot.stopAvailable,
    assistantMessageCount: snapshot.assistantMessageCount,
    pageAlert: snapshot.pageAlert,
    degradationCodes: snapshot.degradationCodes,
    conversation: snapshot.conversation,
  });
}

export class ChatGptAdapter {
  readonly #dom: ChatGptDomEnvironment;
  readonly #streamObservationMinIntervalMs: number;

  constructor(dom: ChatGptDomEnvironment, options: { streamObservationMinIntervalMs?: number } = {}) {
    this.#dom = dom;
    this.#streamObservationMinIntervalMs = Math.max(0, options.streamObservationMinIntervalMs ?? CHATGPT_STREAM_OBSERVATION_MIN_INTERVAL_MS);
  }

  snapshot(): ChatGptAdapterSnapshot {
    const structural = this.#structuralPreflight();
    const send = this.#findSend();
    const stop = this.#findStop();
    const continueButton = this.#findContinue();
    const assistantMessages = this.#visibleAll(CHATGPT_SELECTOR_REGISTRY.assistantMessages.candidates[0]!);
    const latest = assistantMessages.at(-1);
    const latestText = latest === undefined ? '' : normalizeText(this.#dom.readText(latest));
    const assistantFingerprint = createAssistantFingerprint(assistantMessages.length, latestText);
    const structurallyReady = !structural.degradationCodes.some((code) => code === 'unsupported_route' || code === 'composer_missing' || code === 'composer_ambiguous' || code === 'adapter_drift');

    return freezeJsonValue({
      schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
      ready: structurallyReady,
      busy: stop !== null,
      composerPresent: structural.composerCount > 0,
      composerHasDraft: structural.composer !== null && this.#dom.readComposer(structural.composer.handle).trim().length !== 0,
      sendAvailable: send !== null && !this.#dom.isDisabled(send.handle),
      continueAvailable: continueButton !== null && !this.#dom.isDisabled(continueButton.handle),
      stopAvailable: stop !== null && !this.#dom.isDisabled(stop.handle),
      assistantFingerprint,
      assistantMessageCount: assistantMessages.length,
      pageAlert: structural.pageAlert,
      degradationCodes: structural.degradationCodes,
      conversation: structural.conversation,
    });
  }

  diagnostics(): ChatGptAdapterDiagnostics {
    const structural = this.#structuralPreflight();
    const composerMatches = this.#composerMatches();
    const composer = composerMatches.length === 1 ? composerMatches[0]! : null;
    const send = this.#findSend();
    const stop = this.#findStop();
    const continueButton = this.#findContinue();
    const voice = this.#findVoice();
    const assistantMessages = this.#visibleAll(CHATGPT_SELECTOR_REGISTRY.assistantMessages.candidates[0]!);
    const alert = this.#findFirst(CHATGPT_SELECTOR_REGISTRY.pageAlert);

    const composerStatus: SelectorHealth['status'] = composerMatches.length === 0 ? 'absent' : composerMatches.length === 1 ? 'ready' : 'ambiguous';
    const capabilities: SelectorHealth[] = [
      this.#health(CHATGPT_SELECTOR_REGISTRY.composer, composer, composerStatus, composerMatches.length),
      this.#health(CHATGPT_SELECTOR_REGISTRY.assistantMessages, assistantMessages.length === 0 ? null : { handle: assistantMessages[0]!, matchedBy: CHATGPT_SELECTOR_REGISTRY.assistantMessages.candidates[0]! }, assistantMessages.length === 0 ? 'empty' : 'ready', assistantMessages.length),
      this.#health(CHATGPT_SELECTOR_REGISTRY.send, send, send === null ? 'absent' : this.#dom.isDisabled(send.handle) ? 'disabled' : 'ready', send === null ? 0 : 1),
      this.#health(CHATGPT_SELECTOR_REGISTRY.stop, stop, stop === null ? 'absent' : this.#dom.isDisabled(stop.handle) ? 'disabled' : 'ready', stop === null ? 0 : 1),
      this.#health(CHATGPT_SELECTOR_REGISTRY.continue, continueButton, continueButton === null ? 'absent' : this.#dom.isDisabled(continueButton.handle) ? 'disabled' : 'ready', continueButton === null ? 0 : 1),
      this.#health(CHATGPT_SELECTOR_REGISTRY.voice, voice, voice === null ? 'absent' : this.#dom.isDisabled(voice.handle) ? 'disabled' : 'ready', voice === null ? 0 : 1),
      this.#health(CHATGPT_SELECTOR_REGISTRY.pageAlert, alert, alert === null ? 'absent' : 'ready', alert === null ? 0 : 1),
    ];
    const unavailable = structural.degradationCodes.some((code) => code === 'unsupported_route' || code === 'composer_missing' || code === 'composer_ambiguous' || code === 'adapter_drift');

    return freezeJsonValue({
      schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
      status: unavailable ? 'unavailable' : structural.degradationCodes.length === 0 ? 'ready' : 'degraded',
      reasonCodes: structural.degradationCodes,
      capabilities,
      pageAlert: structural.pageAlert,
    });
  }

  async send(message: string, timeoutMs = 5_000, expectedAssistantBaselineFingerprint?: string, expectedConversation?: ChatGptConversationContext): Promise<ChatGptSendResult> {
    const structural = this.#assertSendPreflight();
    if (expectedConversation !== undefined && !sameConversationContext(structural.conversation, expectedConversation)) {
      throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.conversationChanged, 'ChatGPT conversation changed before send');
    }
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.invalidCommand, 'Message must be non-empty');
    }
    const composer = structural.composer!;
    if (this.#dom.readComposer(composer.handle).trim().length !== 0) {
      throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.draftNotEmpty, 'Composer contains unsent text');
    }

    const assistantBaselineFingerprint = this.snapshot().assistantFingerprint;
    if (expectedAssistantBaselineFingerprint !== undefined && assistantBaselineFingerprint !== expectedAssistantBaselineFingerprint) {
      throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.responseBaselineChanged, 'Assistant response baseline changed before send');
    }
    this.#dom.writeComposer(composer.handle, message);
    const send = await this.#waitForEnabled(() => this.#findSend(), timeoutMs);
    if (send === null) throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.capabilityUnavailable, 'Enabled ChatGPT send capability was not found');
    const beforeClickStructural = this.#assertSendPreflight();
    const beforeClick = this.snapshot();
    if (expectedConversation !== undefined && !sameConversationContext(beforeClickStructural.conversation, expectedConversation)) {
      throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.conversationChanged, 'ChatGPT conversation changed before send click');
    }
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
    let stopped = false;
    let previousFullFingerprint = '';
    let previousSemanticFingerprint = '';
    let lastEmittedAt = Number.NEGATIVE_INFINITY;
    let pendingSnapshot: ChatGptAdapterSnapshot | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;

    const emitSnapshot = (reason: ChatGptObservation['reason'], snapshot: ChatGptAdapterSnapshot) => {
      if (stopped) return;
      const fullFingerprint = JSON.stringify(snapshot);
      if (fullFingerprint === previousFullFingerprint) return;
      previousFullFingerprint = fullFingerprint;
      previousSemanticFingerprint = observationSemanticFingerprint(snapshot);
      lastEmittedAt = this.#dom.now();
      revision += 1;
      listener(freezeJsonValue({
        schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
        revision,
        reason,
        observedAt: this.#dom.isoNow(),
        snapshot,
      }));
    };

    const clearPending = () => {
      pendingSnapshot = null;
      if (pendingTimer !== undefined) clearTimeout(pendingTimer);
      pendingTimer = undefined;
    };

    const capture = () => {
      if (stopped) return;
      const snapshot = this.snapshot();
      const fullFingerprint = JSON.stringify(snapshot);
      if (fullFingerprint === previousFullFingerprint || (pendingSnapshot !== null && fullFingerprint === JSON.stringify(pendingSnapshot))) return;
      const semanticFingerprint = observationSemanticFingerprint(snapshot);
      const onlyStreamingTextChanged = snapshot.busy && semanticFingerprint === previousSemanticFingerprint;
      const elapsed = this.#dom.now() - lastEmittedAt;
      if (!onlyStreamingTextChanged || elapsed >= this.#streamObservationMinIntervalMs) {
        clearPending();
        emitSnapshot('dom_mutation', snapshot);
        return;
      }
      pendingSnapshot = snapshot;
      if (pendingTimer !== undefined) return;
      const delay = Math.max(1, this.#streamObservationMinIntervalMs - elapsed);
      pendingTimer = setTimeout(() => {
        pendingTimer = undefined;
        const pending = pendingSnapshot;
        pendingSnapshot = null;
        if (pending !== null) emitSnapshot('coalesced_stream', pending);
      }, delay);
    };

    emitSnapshot('initial', this.snapshot());
    const disconnect = this.#dom.observe(() => {
      if (queued || stopped) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        capture();
      });
    });

    return () => { stopped = true; disconnect(); clearPending(); };
  }

  #clickIfAvailable(match: Match | null): ChatGptClickResult {
    if (match === null || this.#dom.isDisabled(match.handle)) {
      return freezeJsonValue({ schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION, clicked: false });
    }
    this.#dom.click(match.handle);
    return freezeJsonValue({ schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION, clicked: true });
  }

  #composerMatches(): Match[] {
    const selector = CHATGPT_SELECTOR_REGISTRY.composer.candidates[0]!;
    return this.#visibleAll(selector).map((handle) => ({ handle, matchedBy: selector }));
  }

  #findComposer(): Match | null {
    const matches = this.#composerMatches();
    return matches.length === 1 ? matches[0]! : null;
  }

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

  #findVoice(): Match | null {
    const exact = this.#findFirstCandidates(CHATGPT_SELECTOR_REGISTRY.voice.candidates);
    if (exact !== null) return exact;
    for (const button of this.#dom.queryAll(CHATGPT_SELECTOR_REGISTRY.voice.fallback!)) {
      if (!this.#dom.isVisible(button)) continue;
      if (VOICE_ARIA_PATTERN.test(this.#dom.getAttribute(button, 'aria-label') ?? '')) return { handle: button, matchedBy: 'aria-label' };
    }
    return null;
  }

  #pageAlert(): string | null {
    const alert = this.#findFirst(CHATGPT_SELECTOR_REGISTRY.pageAlert);
    if (alert === null) return null;
    const text = boundedText(this.#dom.readText(alert.handle));
    return text.length === 0 ? null : text;
  }

  #structuralPreflight(): StructuralPreflight {
    const conversation = conversationContextFromUrl(this.#dom.currentUrl?.() ?? '');
    const composerMatches = this.#composerMatches();
    const composer = composerMatches.length === 1 ? composerMatches[0]! : null;
    const pageAlert = this.#pageAlert();
    const codes: ChatGptDegradationCode[] = [];
    if (conversation.kind === 'unsupported') codes.push('unsupported_route');
    if (composerMatches.length === 0) {
      codes.push('composer_missing');
      const driftHints = CHATGPT_SELECTOR_REGISTRY.composerDriftHint.candidates.flatMap((selector) => this.#visibleAll(selector));
      if (driftHints.length > 0) codes.push('adapter_drift');
    } else if (composerMatches.length > 1) {
      codes.push('composer_ambiguous');
    }
    if (pageAlert !== null) codes.push(RATE_LIMIT_ALERT_PATTERN.test(pageAlert) ? 'likely_rate_limited' : 'page_alert');
    return { composer, composerCount: composerMatches.length, conversation, pageAlert, degradationCodes: uniqueCodes(codes) };
  }

  #assertSendPreflight(): StructuralPreflight {
    const result = this.#structuralPreflight();
    if (result.conversation.kind === 'unsupported') throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.unsupportedRoute, 'Current ChatGPT route does not support iteration sends');
    if (result.composerCount === 0) throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.composerMissing, 'Visible editable ChatGPT composer was not found');
    if (result.composerCount > 1) throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.composerAmbiguous, 'Multiple visible editable ChatGPT composers were found');
    if (result.degradationCodes.includes('likely_rate_limited')) throw new ChatGptAdapterError(CHATGPT_ADAPTER_ERROR_CODES.rateLimited, 'ChatGPT appears rate limited or temporarily unavailable');
    return result;
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
    return freezeJsonValue({ key: definition.key, role: definition.role, requirement: definition.requirement, status, matchedBy: match?.matchedBy ?? null, count });
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
