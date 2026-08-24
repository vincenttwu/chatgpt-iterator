import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSuccessResponse, requireMessageEnvelope } from '../src/core/index.ts';
import { CHATGPT_ADAPTER_SCHEMA_VERSION } from '../src/chatgpt/types.ts';
import { AutoDiscardGuardManager, ChatGptTabRegistry } from '../src/tabs/index.ts';
import { BackgroundMessageRouter, TabRuntimeServer } from '../src/runtime/index.ts';
import { ControlPlaneAuthority, ControlPlaneServer } from '../src/control-plane/index.ts';
import { createRequest } from '../src/core/index.ts';
import { TAB_RUNTIME_OPERATIONS } from '../src/tabs/types.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

class EventChannel {
  listeners = new Set();
  addListener = (listener) => { this.listeners.add(listener); };
  removeListener = (listener) => { this.listeners.delete(listener); };
  emit(...args) { for (const listener of [...this.listeners]) listener(...args); }
}

const adapterSnapshot = (overrides = {}) => ({
  schemaVersion: CHATGPT_ADAPTER_SCHEMA_VERSION,
  ready: true,
  busy: false,
  composerPresent: true,
  composerHasDraft: false,
  sendAvailable: true,
  continueAvailable: false,
  stopAvailable: false,
  assistantFingerprint: 'af2:11111111111111111111111111111111',
  assistantMessageCount: 1,
  pageAlert: null,
  ...overrides,
});

class FakeTabs {
  onActivated = new EventChannel();
  onUpdated = new EventChannel();
  onRemoved = new EventChannel();
  onReplaced = new EventChannel();
  tabs = new Map();
  adapterByTab = new Map();
  updates = [];

  add(tab, snapshot = adapterSnapshot()) { this.tabs.set(tab.id, { status: 'complete', frozen: false, discarded: false, autoDiscardable: true, active: false, ...tab }); this.adapterByTab.set(tab.id, snapshot); }
  async query() { return [...this.tabs.values()].filter((tab) => tab.url?.startsWith('https://chatgpt.com/') || tab.url?.startsWith('https://chat.openai.com/')); }
  async get(tabId) { const tab = this.tabs.get(tabId); if (!tab) throw new Error('No tab'); return { ...tab }; }
  async update(tabId, update) { const tab = await this.get(tabId); const next = { ...tab, ...update }; this.tabs.set(tabId, next); this.updates.push([tabId, update]); return next; }
  async sendMessage(tabId, raw) {
    const snapshot = this.adapterByTab.get(tabId);
    if (snapshot === undefined) throw new Error('Receiving end does not exist');
    const request = requireMessageEnvelope(raw);
    return createSuccessResponse(request, snapshot);
  }
}

function createRegistry(fake) { return new ChatGptTabRegistry(fake, () => '2026-08-24T03:00:00+08:00'); }

async function nextTurn() { await new Promise((resolve) => setTimeout(resolve, 0)); }

test('STEP-05 discovers eligible ChatGPT tabs with adapter readiness and explicit lifecycle', async () => {
  const fake = new FakeTabs();
  fake.add({ id: 10, windowId: 1, active: true, title: 'One', url: 'https://chatgpt.com/c/one' });
  fake.add({ id: 11, windowId: 1, title: 'Two', url: 'https://chat.openai.com/c/two', frozen: true });
  fake.add({ id: 12, windowId: 1, title: 'Other', url: 'https://example.com/' });
  const registry = createRegistry(fake);
  const snapshot = await registry.refresh();
  assert.deepEqual(snapshot.targets.map((target) => [target.tabId, target.lifecycleState, target.contentConnected]), [[10, 'ready', true], [11, 'frozen', false]]);
});

test('STEP-05 explicit target binding never follows active browser-tab changes', async () => {
  const fake = new FakeTabs();
  fake.add({ id: 10, windowId: 1, active: true, url: 'https://chatgpt.com/c/one' });
  fake.add({ id: 11, windowId: 1, active: false, url: 'https://chatgpt.com/c/two' });
  const registry = createRegistry(fake);
  await registry.refresh();
  await registry.bind(10);
  await registry.handleActivated(11, 1);
  const snapshot = registry.snapshot();
  assert.equal(snapshot.binding.tabId, 10);
  assert.equal(snapshot.targets.find((target) => target.tabId === 11).active, true);
});

test('STEP-05 frozen, discarded and reload states are normalized instead of waiting on content execution', async () => {
  const fake = new FakeTabs();
  fake.add({ id: 10, windowId: 1, url: 'https://chatgpt.com/c/one' });
  const registry = createRegistry(fake);
  await registry.refresh();
  await registry.bind(10);
  await registry.handleUpdated(10, { frozen: true }, { ...(await fake.get(10)), frozen: true });
  assert.equal(registry.snapshot().targets[0].lifecycleState, 'frozen');
  await registry.handleUpdated(10, { frozen: false, discarded: true }, { ...(await fake.get(10)), frozen: false, discarded: true });
  assert.equal(registry.snapshot().targets[0].lifecycleState, 'discarded');
  await registry.handleUpdated(10, { discarded: false, status: 'loading' }, { ...(await fake.get(10)), discarded: false, status: 'loading' });
  assert.equal(registry.snapshot().targets[0].lifecycleState, 'loading');
  const complete = { ...(await fake.get(10)), discarded: false, frozen: false, status: 'complete' };
  fake.tabs.set(10, complete);
  await registry.handleUpdated(10, { status: 'complete' }, complete);
  assert.equal(registry.snapshot().targets[0].lifecycleState, 'ready');
  assert.equal(registry.snapshot().binding.tabId, 10);
});

test('STEP-05 content adapter state reconnects a reload without changing target binding', async () => {
  const fake = new FakeTabs();
  fake.add({ id: 10, windowId: 1, url: 'https://chatgpt.com/c/one' });
  const registry = createRegistry(fake);
  await registry.refresh();
  await registry.bind(10);
  fake.adapterByTab.delete(10);
  await registry.handleUpdated(10, { status: 'complete' }, await fake.get(10));
  assert.equal(registry.snapshot().targets[0].lifecycleState, 'unavailable');
  await registry.noteAdapterState(10, 1, adapterSnapshot({ busy: true }));
  const snapshot = registry.snapshot();
  assert.equal(snapshot.binding.tabId, 10);
  assert.equal(snapshot.targets[0].lifecycleState, 'ready');
  assert.equal(snapshot.targets[0].adapterBusy, true);
});

test('STEP-05 closing the target clears binding and records explicit closed termination', async () => {
  const fake = new FakeTabs();
  fake.add({ id: 10, windowId: 3, url: 'https://chatgpt.com/c/one' });
  const registry = createRegistry(fake);
  await registry.refresh();
  await registry.bind(10);
  registry.handleRemoved(10, 3);
  const snapshot = registry.snapshot();
  assert.equal(snapshot.binding, null);
  assert.deepEqual([snapshot.lastTermination.lifecycleState, snapshot.lastTermination.reason, snapshot.lastTermination.tabId], ['closed', 'closed', 10]);
});

test('STEP-05 Chrome replacement transfers an explicit binding to the replacement ChatGPT tab', async () => {
  const fake = new FakeTabs();
  fake.add({ id: 10, windowId: 1, url: 'https://chatgpt.com/c/one' });
  fake.add({ id: 20, windowId: 1, url: 'https://chatgpt.com/c/one' });
  const registry = createRegistry(fake);
  await registry.refresh();
  await registry.bind(10);
  await registry.handleReplaced(20, 10);
  const snapshot = registry.snapshot();
  assert.equal(snapshot.binding.tabId, 20);
  assert.equal(snapshot.binding.reason, 'replacement');
});

test('STEP-05 autoDiscardable guard is reference-counted and restores the original state', async () => {
  const fake = new FakeTabs();
  fake.add({ id: 10, windowId: 1, url: 'https://chatgpt.com/c/one', autoDiscardable: true });
  const guards = new AutoDiscardGuardManager(fake);
  await guards.acquire('run-a', 10);
  await guards.acquire('run-b', 10);
  assert.equal((await fake.get(10)).autoDiscardable, false);
  assert.equal(fake.updates.length, 1);
  await guards.release('run-a');
  assert.equal((await fake.get(10)).autoDiscardable, false);
  await guards.release('run-b');
  assert.equal((await fake.get(10)).autoDiscardable, true);
  assert.deepEqual(fake.updates.map((entry) => entry[1].autoDiscardable), [false, true]);
});

test('STEP-05 tab runtime exposes explicit bind/refresh commands and content adapter-state sender identity', async () => {
  const fake = new FakeTabs();
  fake.add({ id: 10, windowId: 1, url: 'https://chatgpt.com/c/one' });
  const registry = createRegistry(fake);
  const tabServer = new TabRuntimeServer(registry);
  const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
  const router = new BackgroundMessageRouter(new ControlPlaneServer(new ControlPlaneAuthority()), tabServer, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, extensionId);
  const panelSender = { id: extensionId, origin: `chrome-extension://${extensionId}`, url: `chrome-extension://${extensionId}/sidepanel.html` };
  const refresh = createRequest({ requestSequence: 1, intent: 'query', source: 'sidepanel', target: 'background', operation: TAB_RUNTIME_OPERATIONS.refresh, payload: {} });
  const refreshed = requireMessageEnvelope(await router.handle(refresh, panelSender));
  assert.equal(refreshed.outcome.ok && refreshed.outcome.value.targets.length, 1);
  const bind = createRequest({ requestSequence: 2, intent: 'command', source: 'sidepanel', target: 'background', operation: TAB_RUNTIME_OPERATIONS.bind, payload: { tabId: 10 } });
  const bound = requireMessageEnvelope(await router.handle(bind, panelSender));
  assert.equal(bound.outcome.ok && bound.outcome.value.binding.tabId, 10);
  const state = createRequest({ requestSequence: 1, intent: 'command', source: 'content', target: 'background', operation: TAB_RUNTIME_OPERATIONS.adapterState, payload: { snapshot: adapterSnapshot({ pageAlert: 'Network error' }) } });
  const stateResult = requireMessageEnvelope(await router.handle(state, { id: extensionId, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/one', tab: { id: 10, windowId: 1, url: 'https://chatgpt.com/c/one' } }));
  assert.equal(stateResult.outcome.ok && stateResult.outcome.value.targets[0].lifecycleState, 'degraded');
});

test('STEP-05 source wiring observes lifecycle without adding tabs permission or active-tab retargeting', async () => {
  const [background, content, config] = await Promise.all([text('entrypoints/background.ts'), text('entrypoints/chatgpt.content.ts'), text('wxt.config.ts')]);
  assert.match(background, /TabLifecycleCoordinator/);
  assert.match(background, /AutoDiscardGuardManager/);
  assert.match(background, /tabs\.subscribe/);
  assert.match(background, /BackgroundMessageRouter/);
  assert.match(content, /TAB_RUNTIME_OPERATIONS\.adapterState/);
  assert.match(content, /source:\s*'content'/);
  assert.doesNotMatch(config, /['"]tabs['"]/);
  assert.doesNotMatch(background, /onActivated[\s\S]{0,300}bind\(/);
});
