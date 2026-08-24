import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequest, requireMessageEnvelope } from '../src/core/index.ts';
import {
  CHATGPT_ADAPTER_OPERATIONS,
  CHATGPT_SELECTOR_REGISTRY,
  ChatGptAdapter,
  ChatGptAdapterServer,
  ResponseCompletionTracker,
  isAssistantFingerprint,
} from '../src/chatgpt/index.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function element(input = {}) {
  return {
    visible: true,
    text: '',
    draft: '',
    disabled: false,
    attrs: {},
    clicks: 0,
    ...input,
  };
}

class FakeDom {
  map = new Map();
  observers = new Set();
  scrolled = false;
  clock = 1_000;

  set(selector, values) { this.map.set(selector, Array.isArray(values) ? values : [values]); }
  queryOne(selector) { return this.map.get(selector)?.[0] ?? null; }
  queryAll(selector) { return [...(this.map.get(selector) ?? [])]; }
  isVisible(handle) { return handle.visible !== false; }
  readText(handle) { return handle.text ?? ''; }
  readComposer(handle) { return handle.draft ?? ''; }
  writeComposer(handle, message) { handle.draft = message; this.trigger(); }
  getAttribute(handle, name) { return handle.attrs?.[name] ?? null; }
  isDisabled(handle) { return handle.disabled === true || handle.attrs?.['aria-disabled'] === 'true'; }
  click(handle) { handle.clicks += 1; }
  observe(callback) { this.observers.add(callback); return () => this.observers.delete(callback); }
  scrollToBottom() { this.scrolled = true; }
  now() { return this.clock; }
  isoNow() { return new Date(this.clock).toISOString(); }
  currentUrl() { return 'https://chatgpt.com/c/A'; }
  trigger() { for (const observer of [...this.observers]) observer(); }
}

function readyFixture() {
  const dom = new FakeDom();
  const composer = element();
  const send = element({ attrs: { 'data-testid': 'send-button' } });
  dom.set('#prompt-textarea[contenteditable="true"]', composer);
  dom.set('button[data-testid="send-button"]', send);
  dom.set('button[aria-label]', []);
  dom.set('button', []);
  dom.set('[data-message-author-role="assistant"]', []);
  dom.set('[role="alert"]', []);
  return { dom, composer, send, adapter: new ChatGptAdapter(dom) };
}

function request(operation, payload = {}, intent = 'query') {
  return createRequest({ requestSequence: 1, intent, source: 'background', target: 'content', operation, payload });
}

test('STEP-04 selector registry centralizes verified userscript selectors and conditional fallbacks', () => {
  assert.deepEqual(CHATGPT_SELECTOR_REGISTRY.composer.candidates, ['#prompt-textarea[contenteditable="true"]']);
  assert.deepEqual(CHATGPT_SELECTOR_REGISTRY.send.candidates, ['button[data-testid="send-button"]']);
  assert.deepEqual(CHATGPT_SELECTOR_REGISTRY.stop.candidates, ['button[data-testid="stop-button"]']);
  assert.deepEqual(CHATGPT_SELECTOR_REGISTRY.assistantMessages.candidates, ['[data-message-author-role="assistant"]']);
  assert.equal(CHATGPT_SELECTOR_REGISTRY.continue.fallback, 'button');
});

test('STEP-04 adapter snapshots ready, busy, response, continue and visible error states semantically', () => {
  const { dom, adapter } = readyFixture();
  const stop = element({ attrs: { 'data-testid': 'stop-button' } });
  const continued = element({ text: 'Continue generating' });
  const alert = element({ text: 'Something went wrong. Please retry.' });
  dom.set('button[data-testid="stop-button"]', stop);
  dom.set('button', [continued]);
  dom.set('[role="alert"]', [alert]);
  dom.set('[data-message-author-role="assistant"]', [element({ text: 'First response' }), element({ text: 'Latest assistant response' })]);

  const snapshot = adapter.snapshot();
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.busy, true);
  assert.equal(snapshot.continueAvailable, true);
  assert.equal(snapshot.stopAvailable, true);
  assert.equal(snapshot.assistantMessageCount, 2);
  assert.equal(isAssistantFingerprint(snapshot.assistantFingerprint), true);
  assert.equal(JSON.stringify(snapshot).includes('Latest assistant response'), false);
  assert.equal(snapshot.pageAlert, 'Something went wrong. Please retry.');
  assert.equal(adapter.diagnostics().status, 'degraded');
});

test('STEP-04 send preserves empty-draft safety, captures response baseline, writes composer and clicks verified send', async () => {
  const { composer, send, adapter } = readyFixture();
  const result = await adapter.send('Continue with the next version.');
  assert.equal(result.status, 'sent');
  assert.equal(isAssistantFingerprint(result.assistantBaselineFingerprint), true);
  assert.equal(composer.draft, 'Continue with the next version.');
  assert.equal(send.clicks, 1);

  const unsafe = readyFixture();
  unsafe.composer.draft = 'Do not overwrite me';
  await assert.rejects(() => unsafe.adapter.send('new text'), /Composer contains unsent text/);
  assert.equal(unsafe.send.clicks, 0);
});

test('STEP-04 send waits on mutation rather than short-interval polling when the send control becomes enabled', async () => {
  const { dom, send, adapter } = readyFixture();
  send.disabled = true;
  const pending = adapter.send('Queued message', 250);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(send.clicks, 0);
  send.disabled = false;
  dom.trigger();
  const result = await pending;
  assert.equal(result.status, 'sent');
  assert.equal(send.clicks, 1);
});

test('STEP-04 continue and stop use semantic click results without requiring controls to exist', () => {
  const { dom, adapter } = readyFixture();
  assert.equal(adapter.continueResponse().clicked, false);
  assert.equal(adapter.stopResponse().clicked, false);

  const continued = element({ text: '繼續生成' });
  const stop = element({ attrs: { 'aria-label': 'Stop generating' } });
  dom.set('button', [continued]);
  dom.set('button[aria-label]', [stop]);
  assert.equal(adapter.continueResponse().clicked, true);
  assert.equal(adapter.stopResponse().clicked, true);
  assert.equal(continued.clicks, 1);
  assert.equal(stop.clicks, 1);
});

test('STEP-04 MutationObserver stream coalesces DOM activity and emits only semantic state changes', async () => {
  const { dom, adapter } = readyFixture();
  const observations = [];
  const stop = adapter.observe((observation) => observations.push(observation));
  assert.equal(observations.length, 1);
  dom.trigger();
  dom.trigger();
  await Promise.resolve();
  assert.equal(observations.length, 1, 'unchanged mutation burst is ignored');

  dom.set('[data-message-author-role="assistant"]', [element({ text: 'A response arrived' })]);
  dom.trigger();
  dom.trigger();
  await Promise.resolve();
  assert.equal(observations.length, 2);
  assert.equal(observations[1].revision, 2);
  assert.equal(observations[1].snapshot.assistantMessageCount, 1);
  stop();
});

test('STEP-04 response tracker preserves response-start timeout, continue and stable-completion semantics without polling ownership', () => {
  const { adapter } = readyFixture();
  const baseline = adapter.snapshot();
  const tracker = new ResponseCompletionTracker(baseline.assistantFingerprint, 1_000, { responseStartTimeoutMs: 120_000, responseStableMs: 3_500 });
  let progress = tracker.observe(baseline, 1_000);
  assert.equal(progress.state, 'waiting_start');
  assert.equal(progress.nextDeadlineAt, 121_000);

  const active = { ...baseline, busy: true, assistantFingerprint: 'af2:11111111111111111111111111111111', assistantMessageCount: 1 };
  progress = tracker.observe(active, 2_000);
  assert.equal(progress.state, 'active');

  const quiet = { ...active, busy: false };
  progress = tracker.observe(quiet, 4_000);
  assert.equal(progress.state, 'active');
  assert.equal(progress.nextDeadlineAt, 5_500);
  progress = tracker.observe(quiet, 5_500);
  assert.equal(progress.state, 'stable');

  const timeoutTracker = new ResponseCompletionTracker(baseline.assistantFingerprint, 1_000);
  assert.equal(timeoutTracker.observe(baseline, 121_000).state, 'timed_out');
  const continueTracker = new ResponseCompletionTracker(baseline.assistantFingerprint, 1_000);
  assert.equal(continueTracker.observe({ ...baseline, continueAvailable: true }, 2_000).state, 'continue_available');
});

test('STEP-04 content server exposes semantic envelope operations and normalizes draft conflicts', async () => {
  const { composer, adapter } = readyFixture();
  const server = new ChatGptAdapterServer(adapter);
  const snapshotResponse = requireMessageEnvelope(await server.handle(request(CHATGPT_ADAPTER_OPERATIONS.snapshot)));
  assert.equal(snapshotResponse.kind, 'response');
  assert.equal(snapshotResponse.outcome.ok, true);
  assert.equal(snapshotResponse.outcome.ok && snapshotResponse.outcome.value.ready, true);

  composer.draft = 'existing draft';
  const sendResponse = requireMessageEnvelope(await server.handle(request(CHATGPT_ADAPTER_OPERATIONS.send, { message: 'new message' }, 'command')));
  assert.equal(sendResponse.kind, 'response');
  assert.equal(sendResponse.outcome.ok, false);
  assert.equal(!sendResponse.outcome.ok && sendResponse.outcome.error.code, 'stale_request');
  assert.equal(!sendResponse.outcome.ok && sendResponse.outcome.error.details.adapterCode, 'draft_not_empty');
});

test('STEP-04 content entrypoint is host-scoped, event-driven and carries no remote chatgpt.js dependency', async () => {
  const content = await text('entrypoints/chatgpt.content.ts');
  const adapter = await text('src/chatgpt/adapter.ts');
  const selectors = await text('src/chatgpt/selectors.ts');
  const packageSource = await text('package.json');
  assert.match(content, /https:\/\/chatgpt\.com\/\*/);
  assert.match(content, /https:\/\/chat\.openai\.com\/\*/);
  assert.match(content, /adapter\.observe/);
  assert.match(adapter, /queueMicrotask/);
  assert.match(adapter, /#waitForEnabled/);
  assert.doesNotMatch(adapter, /setInterval|pollMs|await sleep/);
  assert.match(selectors, /#prompt-textarea/);
  assert.match(selectors, /send-button/);
  assert.match(selectors, /stop-button/);
  assert.match(selectors, /data-message-author-role/);
  assert.doesNotMatch(packageSource, /chatgpt\.js|jsdelivr|unpkg/);
});
