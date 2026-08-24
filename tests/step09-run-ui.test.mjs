import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSuccessResponse, requireMessageEnvelope } from '../src/core/index.ts';
import { createReadyRun, nextRunState } from '../src/runs/model.ts';
import {
  SidePanelOperationalClient,
  canPauseRun,
  canResumeRun,
  canStartExistingRun,
  canStopRun,
  choosePrimaryRun,
  runProgress,
} from '../src/ui/run-workspace.ts';
import { TAB_REGISTRY_SCHEMA_VERSION } from '../src/tabs/index.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const now = '2026-08-24T04:00:00+08:00';

function tabSnapshot(binding = null) {
  return {
    schemaVersion: TAB_REGISTRY_SCHEMA_VERSION,
    revision: 1,
    targets: [{
      schemaVersion: TAB_REGISTRY_SCHEMA_VERSION,
      tabId: 41,
      windowId: 7,
      active: true,
      title: 'ChatGPT - Iterator',
      url: 'https://chatgpt.com/c/example',
      browserStatus: 'complete',
      lifecycleState: 'ready',
      autoDiscardable: true,
      contentConnected: true,
      adapterReady: true,
      adapterBusy: false,
      pageAlert: null,
      conversation: { schemaVersion: 1, kind: 'conversation', conversationId: 'example', pathname: '/c/example' },
    }],
    binding,
    lastTermination: null,
  };
}

class FakeRuntime {
  requests = [];
  ready = createReadyRun({ id: crypto.randomUUID(), targetTabId: 41, targetWindowId: 7, now });
  async sendMessage(raw) {
    const request = requireMessageEnvelope(raw);
    assert.equal(request.kind, 'request');
    this.requests.push(request);
    switch (request.operation) {
      case 'tabs.refresh': return createSuccessResponse(request, tabSnapshot());
      case 'tabs.bind': return createSuccessResponse(request, tabSnapshot({ schemaVersion: TAB_REGISTRY_SCHEMA_VERSION, tabId: 41, windowId: 7, boundAt: now, reason: 'explicit' }));
      case 'run.list': return createSuccessResponse(request, [this.ready]);
      case 'run.create': return createSuccessResponse(request, { run: this.ready, idempotent: false });
      case 'run.start': {
        const running = nextRunState(this.ready, { lifecycleState: 'running', now: '2026-08-24T04:00:01+08:00' });
        return createSuccessResponse(request, { run: running, idempotent: false });
      }
      case 'run.pause': {
        const paused = nextRunState(this.ready, { lifecycleState: 'paused', resumeState: 'running', now: '2026-08-24T04:00:02+08:00' });
        return createSuccessResponse(request, { run: paused, idempotent: false });
      }
      default: throw new Error(`unexpected operation ${request.operation}`);
    }
  }
}

test('STEP-09 operational client refreshes/binds an explicit target and creates then starts a direct Repeat run', async () => {
  const runtime = new FakeRuntime();
  const client = new SidePanelOperationalClient(runtime);
  const refreshed = await client.refreshTabs();
  assert.equal(refreshed.targets[0].tabId, 41);
  const started = await client.startRepeat({
    targetTabId: 41,
    targetWindowId: 7,
    messageTemplate: 'Continue {iteration}/{total}',
    totalIterations: 5,
    delaySeconds: 7,
    autoContinue: true,
    autoScroll: true,
    preventDiscard: true,
  });
  assert.equal(started.lifecycleState, 'running');
  assert.deepEqual(runtime.requests.map((request) => request.operation), ['tabs.refresh', 'tabs.bind', 'run.create', 'run.start']);
  const create = runtime.requests.find((request) => request.operation === 'run.create');
  assert.equal(create.payload.targetTabId, 41);
  assert.equal(create.payload.targetWindowId, 7);
  assert.equal(create.payload.messageTemplate, 'Continue {iteration}/{total}');
  assert.equal(create.payload.totalIterations, 5);
  assert.equal(create.payload.delaySeconds, 7);
});

test('STEP-09 run view model selects nonterminal authority, reports progress, and exposes lifecycle controls', () => {
  const terminal = nextRunState(createReadyRun({ id: crypto.randomUUID(), targetTabId: 1, targetWindowId: 1, now }), { lifecycleState: 'completed', now: '2026-08-24T04:00:03+08:00' });
  const ready = createReadyRun({ id: crypto.randomUUID(), targetTabId: 2, targetWindowId: 1, now: '2026-08-24T04:00:04+08:00' });
  assert.equal(choosePrimaryRun([terminal, ready]).id, ready.id);
  assert.deepEqual(runProgress(ready), { completed: 0, total: 5, currentIteration: 1, percent: 0 });
  assert.equal(canStartExistingRun('ready'), true);
  assert.equal(canPauseRun('waiting_response'), true);
  assert.equal(canResumeRun('paused'), true);
  assert.equal(canStopRun('ready'), true);
  assert.equal(canStopRun('completed'), false);
});

test('STEP-09 Run workspace is the normal operational entry point and keeps Presets optional', async () => {
  const [app, messages] = await Promise.all([text('entrypoints/sidepanel/App.vue'), text('src/ui/messages.ts')]);
  assert.match(app, /activeWorkspace = ref<WorkspaceId>\('run'\)/);
  assert.match(app, /id="target-tab"/);
  assert.match(app, /refreshTargets/);
  assert.match(app, /bindSelectedTarget/);
  assert.match(app, /noPresetDirect/);
  assert.match(app, /id="run-message"/);
  assert.match(app, /id="run-iterations"/);
  assert.match(app, /id="run-delay"/);
  assert.match(app, /draft\.autoContinue/);
  assert.match(app, /startNewRun/);
  assert.match(app, /mutateCurrent\('pause'\)/);
  assert.match(app, /mutateCurrent\('resume'\)/);
  assert.match(app, /mutateCurrent\('stop'\)/);
  assert.match(app, /<progress/);
  assert.match(app, /currentProjection\?\.attentionKey/);
  assert.match(messages, /frozenExplanation:/);
  assert.match(messages, /discardedExplanation:/);
});

test('STEP-09 preserves the exact five-tab team-standard shell and CRSniffer interaction grammar', async () => {
  const [app, workspaces, css, pkg] = await Promise.all([
    text('entrypoints/sidepanel/App.vue'),
    text('src/ui/workspaces.ts'),
    text('entrypoints/sidepanel/style.css'),
    text('package.json'),
  ]);
  assert.match(workspaces, /\['run', 'queue', 'presets', 'templates', 'settings'\]/);
  assert.match(app, /role="tablist"/);
  assert.match(app, /role="tab"/);
  assert.match(app, /role="tabpanel"/);
  assert.match(app, /workspace-card__heading/);
  assert.match(app, /field-stack/);
  assert.match(app, /field-with-action/);
  assert.match(app, /check-row/);
  assert.match(app, /status-grid/);
  assert.match(app, /actions/);
  assert.match(css, /\.workspace-card/);
  assert.match(css, /\.field-stack/);
  assert.match(css, /\.secondary-action/);
  assert.equal(JSON.parse(pkg).dependencies.bootstrap, undefined);
});

test('STEP-09 narrow Side Panel, focus, status, reduced-motion, and forced-color contracts remain explicit', async () => {
  const [app, css] = await Promise.all([text('entrypoints/sidepanel/App.vue'), text('entrypoints/sidepanel/style.css')]);
  assert.match(app, /role="status"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /@keydown="onTabKeydown/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width:\s*320px\)/);
  assert.match(css, /@media \(max-width:\s*360px\)/);
  assert.match(css, /@container app-shell \(max-width:\s*310px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media \(forced-colors:\s*active\)/);
  assert.match(css, /CanvasText/);
  assert.match(css, /Highlight/);
});

test('STEP-09 run and tab invalidations are separated so streaming tab updates do not force run-list hydration', async () => {
  const [background, types, panel, app] = await Promise.all([
    text('entrypoints/background.ts'), text('src/control-plane/types.ts'), text('src/control-plane/panel-client.ts'), text('entrypoints/sidepanel/App.vue'),
  ]);
  assert.match(types, /'tab_changed'/);
  assert.match(types, /'run_changed'/);
  assert.match(panel, /'tab_changed'/);
  assert.match(panel, /'run_changed'/);
  assert.match(background, /ports\.broadcast\('tab_changed'\)/);
  assert.match(background, /manager\.subscribe\([\s\S]*?ports\.broadcast\('run_changed'\)/);
  assert.match(app, /reason === 'run_changed'/);
  assert.match(app, /reason === 'tab_changed'/);
});

test('STEP-09 direct-first Run ownership remains intact after later workspace domains land', async () => {
  const [app, messages] = await Promise.all([text('entrypoints/sidepanel/App.vue'), text('src/ui/messages.ts')]);
  assert.match(app, /activeWorkspace = ref<WorkspaceId>\('run'\)/);
  assert.match(app, /noPresetDirect/);
  assert.match(app, /startNewRun/);
  assert.match(app, /saveTemplate|updateTemplate|duplicateTemplate|deleteTemplate/);
  assert.match(app, /savePresetAs|updatePreset|duplicatePreset|deletePreset/);
  assert.doesNotMatch(app, /activeWorkspace = ref<WorkspaceId>\('settings'\)/);
});

test('STEP-09 Run copy is localized rather than embedded as a second UI vocabulary', async () => {
  const locale = JSON.parse(await text('public/_locales/en/messages.json'));
  for (const key of ['targetChatGptTab', 'noPresetDirect', 'message', 'iterations', 'delaySeconds', 'startRun', 'pause', 'resume', 'stop', 'frozenExplanation', 'discardedExplanation']) {
    assert.equal(typeof locale[key]?.message, 'string');
    assert.ok(locale[key].message.length > 0);
  }
});
