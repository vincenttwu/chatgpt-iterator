import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ContractError,
  ERROR_CODES,
  MESSAGE_PROTOCOL_VERSION,
  assertJsonSafe,
  createRequest,
  createStableId,
  requireMessageEnvelope,
} from '../src/core/index.ts';
import {
  CONTROL_PLANE_PORT_NAME,
  ControlPlaneAuthority,
  ControlPlanePortHub,
  ControlPlaneServer,
  SidePanelControlClient,
} from '../src/control-plane/index.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

class FakePort {
  constructor(name) { this.name = name; }
  messages = [];
  disconnected = [];
  messageListeners = [];
  name;
  onDisconnect = { addListener: (listener) => { this.disconnected.push(listener); } };
  onMessage = { addListener: (listener) => { this.messageListeners.push(listener); } };
  postMessage(message) { this.messages.push(message); for (const listener of this.messageListeners) listener(message); }
  disconnect() { for (const listener of this.disconnected) listener(); }
}

class FakeRuntime {
  constructor(server, delay = async () => undefined) { this.server = server; this.delay = delay; }
  server;
  delay;
  ports = [];
  async sendMessage(message) { await this.delay(message.requestSequence); return this.server.handle(message); }
  connect({ name }) { const port = new FakePort(name); this.ports.push(port); return port; }
}

test('STEP-03 core enforces JSON-safe values and UUID-v4 stable identifiers', () => {
  assertJsonSafe({ ok: true, nested: [1, 'two', null] });
  assert.throws(() => assertJsonSafe({ bad: undefined }), /must not be undefined/);
  assert.throws(() => assertJsonSafe(Number.NaN), /finite JSON number/);
  assert.match(createStableId('request'), /^[0-9a-f-]{36}$/i);
});

test('STEP-03 request envelopes are versioned, correlated, contextual, and strict about protocol versions', () => {
  const request = createRequest({
    requestSequence: 7,
    intent: 'query',
    source: 'sidepanel',
    target: 'background',
    operation: 'panel.hydrate',
    payload: {},
  });
  const parsed = requireMessageEnvelope(request);
  assert.equal(parsed.kind, 'request');
  assert.equal(parsed.requestSequence, 7);
  assert.equal(parsed.protocolVersion, MESSAGE_PROTOCOL_VERSION);
  assert.equal(parsed.source, 'sidepanel');
  assert.equal(parsed.target, 'background');
  assert.throws(
    () => requireMessageEnvelope({ ...request, protocolVersion: 999 }),
    (error) => error instanceof ContractError && error.code === ERROR_CODES.unsupportedProtocol,
  );
});

test('STEP-03 background control server hydrates bounded application-authority state', async () => {
  const authority = new ControlPlaneAuthority(() => '2026-08-24T02:45:00+08:00');
  const server = new ControlPlaneServer(authority);
  const request = createRequest({ requestSequence: 1, intent: 'query', source: 'sidepanel', target: 'background', operation: 'panel.hydrate', payload: {} });
  const response = requireMessageEnvelope(await server.handle(request));
  assert.equal(response.kind, 'response');
  assert.equal(response.requestId, request.requestId);
  assert.equal(response.requestSequence, 1);
  assert.equal(response.outcome.ok, true);
  assert.equal(response.outcome.ok && response.outcome.value.authorityRevision, 1);
  assert.equal(response.outcome.ok && response.outcome.value.runtime.state, 'ready');
});

test('STEP-03 panel hydration ignores stale out-of-order responses', async () => {
  const authority = new ControlPlaneAuthority(() => '2026-08-24T02:45:00+08:00');
  const server = new ControlPlaneServer(authority);
  const runtime = new FakeRuntime(server, async (sequence) => new Promise((resolve) => setTimeout(resolve, sequence === 1 ? 25 : 1)));
  const client = new SidePanelControlClient(runtime);
  const first = client.hydrate();
  const second = client.hydrate();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.applied, false);
  assert.equal(secondResult.applied, true);
  assert.equal(secondResult.snapshot.authorityRevision, 1);
});

test('STEP-03 a fresh panel client reconstructs state from application authority rather than previous panel-local state', async () => {
  const authority = new ControlPlaneAuthority(() => '2026-08-24T02:45:00+08:00');
  const server = new ControlPlaneServer(authority);
  const runtime = new FakeRuntime(server);
  const firstPanel = new SidePanelControlClient(runtime);
  assert.equal((await firstPanel.hydrate()).snapshot.authorityRevision, 1);
  authority.touch();
  const reopenedPanel = new SidePanelControlClient(runtime);
  const reopened = await reopenedPanel.hydrate();
  assert.equal(reopened.applied, true);
  assert.equal(reopened.snapshot.authorityRevision, 2);
});

test('STEP-03 panel port disconnect schedules reconnect without making the port canonical', () => {
  const authority = new ControlPlaneAuthority(() => '2026-08-24T02:45:00+08:00');
  const runtime = new FakeRuntime(new ControlPlaneServer(authority));
  const client = new SidePanelControlClient(runtime);
  const states = [];
  const scheduled = [];
  const connection = client.connect({ onInvalidation: () => undefined, onStateChange: (state) => states.push(state) }, (callback) => scheduled.push(callback));
  assert.deepEqual(states, ['connected']);
  runtime.ports[0].disconnect();
  assert.deepEqual(states, ['connected', 'reconnecting']);
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(runtime.ports.length, 2);
  assert.deepEqual(states, ['connected', 'reconnecting', 'connected']);
  connection.stop();
  assert.equal(states.at(-1), 'stopped');
});

test('STEP-03 invalidation ports carry bounded hints only and are not canonical snapshots', () => {
  const hub = new ControlPlanePortHub();
  const port = new FakePort(CONTROL_PLANE_PORT_NAME);
  assert.equal(hub.attach(port), true);
  hub.broadcast('authority_changed');
  assert.deepEqual(port.messages.map((message) => message.reason), ['connected', 'authority_changed']);
  for (const message of port.messages) {
    assert.deepEqual(Object.keys(message).sort(), ['kind', 'reason', 'schemaVersion', 'sequence']);
  }
});

test('STEP-03 extension wiring keeps control authority in background and Side Panel reconstructs through client', async () => {
  const background = await text('entrypoints/background.ts');
  const app = await text('entrypoints/sidepanel/App.vue');
  assert.match(background, /ControlPlaneAuthority/);
  assert.match(background, /runtime\.onMessage\.addListener/);
  assert.match(background, /runtime\.onConnect\.addListener/);
  assert.match(app, /SidePanelControlClient/);
  assert.match(app, /hydrateControl/);
  assert.match(app, /onInvalidation/);
  assert.match(app, /onUnmounted\(\(\) => connection\?\.stop\(\)\)/);
  assert.doesNotMatch(app, /localStorage|indexedDB/);
});
