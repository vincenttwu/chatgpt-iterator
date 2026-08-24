import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CHATGPT_SELECTOR_REGISTRY } from '../src/chatgpt/index.ts';
import { EXPORT_FORMAT_VERSION, LOGICAL_MODEL_VERSION, PHYSICAL_DB_VERSION } from '../src/persistence/index.ts';
import {
  INPAGE_CONTROLLER_SCHEMA_VERSION,
  projectInPageControllerStatus,
  projectRunPresentation,
  projectToolbarStatus,
} from '../src/presentation/index.ts';
import {
  RUN_STATE_SCHEMA_VERSION,
  TERMINAL_COMPACTED_MESSAGE,
  compactRunExecution,
  conversationBindingFromContext,
  conversationDisposition,
} from '../src/runs/index.ts';
import { MINI_CONTROLLER_ALLOWED_RUN_ACTIONS, resolveRuntimeCaller } from '../src/runtime/index.ts';
import { TAB_REGISTRY_SCHEMA_VERSION } from '../src/tabs/index.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const conversation = (id) => ({ schemaVersion: 1, kind: 'conversation', conversationId: id, pathname: `/c/${id}` });
const target = (context = conversation('A')) => ({
  schemaVersion: TAB_REGISTRY_SCHEMA_VERSION,
  tabId: 17,
  windowId: 3,
  active: true,
  title: 'ChatGPT',
  url: context.kind === 'conversation' ? `https://chatgpt.com/c/${context.conversationId}` : 'https://chatgpt.com/',
  browserStatus: 'complete',
  lifecycleState: 'ready',
  autoDiscardable: false,
  contentConnected: true,
  adapterReady: true,
  adapterBusy: false,
  pageAlert: null,
  conversation: context,
});
const waitingDelayRun = () => ({
  schemaVersion: RUN_STATE_SCHEMA_VERSION,
  id: crypto.randomUUID(),
  generation: 8,
  lifecycleState: 'waiting_delay',
  targetTabId: 17,
  targetWindowId: 3,
  conversationBinding: { kind: 'conversation', conversationId: 'A' },
  resumeState: null,
  suspensionReason: null,
  failure: null,
  execution: {
    mode: 'repeat',
    messageTemplate: 'Continue {iteration}/{total}',
    totalIterations: 5,
    completedIterations: 2,
    activeIteration: null,
    activeMessage: null,
    activeDelayAfterSeconds: null,
    delaySeconds: 10,
    autoContinue: true,
    autoScroll: true,
    preventDiscard: true,
    assistantBaselineFingerprint: null,
    responseStartedAt: null,
    nextDueAt: '2026-08-24T06:00:06.000Z',
    remainingDelayMs: null,
  },
  createdAt: '2026-08-24T05:59:00.000Z',
  updatedAt: '2026-08-24T06:00:00.000Z',
});

test('STEP-09 sender-derived caller authority distinguishes the Side Panel and top-frame ChatGPT content', () => {
  const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
  const panel = resolveRuntimeCaller({ id: extensionId, origin: `chrome-extension://${extensionId}`, url: `chrome-extension://${extensionId}/sidepanel.html` }, extensionId);
  assert.equal(panel.kind, 'sidepanel');
  const content = resolveRuntimeCaller({ id: extensionId, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/A', tab: { id: 17, windowId: 3, url: 'https://chatgpt.com/c/A' } }, extensionId);
  assert.deepEqual([content.kind, content.tabId, content.windowId], ['chatgpt_content', 17, 3]);
  assert.throws(() => resolveRuntimeCaller({ id: extensionId, frameId: 1, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/A', tab: { id: 17, windowId: 3, url: 'https://chatgpt.com/c/A' } }, extensionId), /top frame/);
});

test('STEP-09 conversation authority permits first new-chat adoption but rejects later same-tab conversation drift', () => {
  const pending = conversationBindingFromContext({ schemaVersion: 1, kind: 'new_chat', conversationId: null, pathname: '/' });
  assert.equal(conversationDisposition(pending, conversation('A')), 'adopt');
  const bound = conversationBindingFromContext(conversation('A'));
  assert.equal(conversationDisposition(bound, conversation('A')), 'match');
  assert.equal(conversationDisposition(bound, conversation('B')), 'mismatch');
});

test('STEP-09 Side Panel, toolbar and mini controller consume one truthful run projection vocabulary', () => {
  const run = waitingDelayRun();
  const now = Date.parse('2026-08-24T06:00:00.000Z');
  const tab = target();
  const shared = projectRunPresentation(run, { now, target: tab });
  const toolbar = projectToolbarStatus([run], [tab], { now });
  const inpage = projectInPageControllerStatus([run], tab, { schemaVersion: INPAGE_CONTROLLER_SCHEMA_VERSION, collapsed: false, dock: 'top_right' }, now);
  assert.equal(shared.lifecycleState, 'waiting_delay');
  assert.deepEqual([shared.completed, shared.total, shared.delayRemainingSeconds], [2, 5, 6]);
  assert.equal(inpage.projection?.labelKey, shared.labelKey);
  assert.deepEqual([inpage.projection?.completed, inpage.projection?.total, inpage.projection?.delayRemainingSeconds], [2, 5, 6]);
  assert.equal(toolbar.global.badgeText, '2/5');
  assert.match(toolbar.global.title, /Next send in 6s/);
});

test('STEP-09 paused delay truth is a frozen remainder rather than an aging absolute deadline', () => {
  const run = waitingDelayRun();
  const paused = {
    ...run,
    lifecycleState: 'paused',
    resumeState: 'waiting_delay',
    suspensionReason: 'user',
    execution: { ...run.execution, nextDueAt: null, remainingDelayMs: 4_000 },
  };
  const projection = projectRunPresentation(paused, { now: Date.parse('2026-08-24T07:00:00.000Z'), target: target() });
  assert.deepEqual([projection.delayRemainingMs, projection.delayRemainingSeconds, projection.delayFrozen], [4_000, 4, true]);
  assert.equal(projection.actions.resume, true);
});

test('STEP-09 mini controller remains a narrow secondary authority surface', () => {
  assert.deepEqual([...MINI_CONTROLLER_ALLOWED_RUN_ACTIONS], ['pause', 'resume', 'stop']);
  const status = projectInPageControllerStatus([waitingDelayRun()], target(), { schemaVersion: INPAGE_CONTROLLER_SCHEMA_VERSION, collapsed: false, dock: 'top_right' }, Date.parse('2026-08-24T06:00:00.000Z'));
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes('Continue {iteration}/{total}'), false);
  assert.equal(serialized.includes('messageTemplate'), false);
  assert.equal(serialized.includes('activeMessage'), false);
});

test('STEP-09 selector authority preserves structural/capability/diagnostic separation', () => {
  assert.deepEqual(CHATGPT_SELECTOR_REGISTRY.composer.candidates, ['#prompt-textarea[contenteditable="true"]']);
  assert.equal(CHATGPT_SELECTOR_REGISTRY.composer.role, 'structural');
  assert.equal(CHATGPT_SELECTOR_REGISTRY.send.role, 'capability');
  assert.equal(CHATGPT_SELECTOR_REGISTRY.stop.role, 'capability');
  assert.equal(CHATGPT_SELECTOR_REGISTRY.composerDriftHint.role, 'diagnostic');
  assert.ok(CHATGPT_SELECTOR_REGISTRY.composerDriftHint.candidates.includes('textarea[name="prompt-textarea"]'));
});

test('STEP-09 terminal execution content is compacted while storage and portable envelope remain independently versioned', () => {
  const compacted = compactRunExecution(waitingDelayRun().execution);
  assert.equal(compacted.mode, 'repeat');
  assert.equal(compacted.messageTemplate, TERMINAL_COMPACTED_MESSAGE);
  assert.equal(compacted.activeMessage, null);
  assert.equal(compacted.nextDueAt, null);
  assert.equal(RUN_STATE_SCHEMA_VERSION, 5);
  assert.equal(LOGICAL_MODEL_VERSION, 5);
  assert.equal(PHYSICAL_DB_VERSION, 1);
  assert.equal(EXPORT_FORMAT_VERSION, 1);
});

test('STEP-09 permissions, CSP, host scope and executable-code boundary remain minimal', async () => {
  const [wxt, content, packageJson] = await Promise.all([text('wxt.config.ts'), text('entrypoints/chatgpt.content.ts'), text('package.json')]);
  const permissions = [...wxt.matchAll(/'([^']+)'/g)].map((match) => match[1]).filter((value) => ['sidePanel', 'storage', 'alarms', 'tabs', 'activeTab', 'debugger', 'scripting', 'unlimitedStorage'].includes(value));
  assert.deepEqual(permissions, ['sidePanel', 'storage', 'alarms']);
  assert.match(wxt, /script-src 'self'; object-src 'self';/);
  assert.doesNotMatch(wxt, /default_popup|<all_urls>|activeTab|debugger|scripting|unlimitedStorage/);
  assert.match(content, /matches: \['https:\/\/chatgpt\.com\/\*', 'https:\/\/chat\.openai\.com\/\*'\]/);
  assert.doesNotMatch(packageJson, /chatgpt\.js|remote/);
  assert.doesNotMatch(`${wxt}\n${content}`, /eval\(|new Function\(/);
});

test('STEP-09 secondary controller retains accessible drag alternatives and primary Side Panel live-region discipline', async () => {
  const [dom, app] = await Promise.all([text('src/presentation/inpage-controller-dom.ts'), text('entrypoints/sidepanel/App.vue')]);
  assert.match(dom, /min-height:44px/);
  assert.match(dom, /prefers-reduced-motion:reduce/);
  assert.match(dom, /forced-colors:active/);
  assert.match(dom, /dock-grid/);
  assert.match(dom, /reset-position/);
  assert.match(dom, /event\.isTrusted/);
  assert.equal((app.match(/role="status"/g) ?? []).length, 1);
  assert.match(app, /role="tablist"/);
});

test('STEP-09 execution remains event-driven with one shared Repeat/Queue coordinator and no content polling loop', async () => {
  const [background, content, coordinator, adapter] = await Promise.all([text('entrypoints/background.ts'), text('entrypoints/chatgpt.content.ts'), text('src/runs/repeat-coordinator.ts'), text('src/chatgpt/adapter.ts')]);
  assert.equal((background.match(/new RepeatRunCoordinator/g) ?? []).length, 1);
  assert.doesNotMatch(content, /setInterval\(/);
  assert.doesNotMatch(coordinator, /setInterval\(/);
  assert.doesNotMatch(adapter, /setInterval\(/);
  assert.match(adapter, /MutationObserver|observe\(/);
});

test('STEP-09 package records close ROADMAP-0002 without implicit successor authorization', async () => {
  const [version, pkgText, manifest, roadmap, matrix] = await Promise.all([
    text('VERSION'), text('package.json'), text('iteration_manifest.yaml'),
    text('agents/records/roadmaps/ROADMAP-0002--interaction-surface-and-runtime-hardening.md'),
    text('agents/records/matrices/MATRIX-0002--successor-hardening-closure.md'),
  ]);
  assert.equal(version.trim(), '0.0.25');
  assert.equal(JSON.parse(pkgText).version, '0.0.25');
  assert.match(manifest, /status: accepted_roadmap_closure/);
  assert.match(manifest, /roadmap_status: closed/);
  assert.match(manifest, /status: not_authorized/);
  assert.match(roadmap, /^status: closed$/m);
  assert.match(roadmap, /\[x\] STEP-09 — Integrated Successor Hardening Closure/);
  assert.doesNotMatch(roadmap, /\[ \] STEP-/);
  assert.match(matrix, /Overall disposition: \*\*ACCEPTED\*\*/);
});
