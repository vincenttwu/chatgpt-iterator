import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApplicationRepositories, PERSISTENCE_STORES } from '../src/persistence/index.ts';
import { PresetService, requirePresetWriteInput, PRESET_RUNTIME_OPERATIONS } from '../src/presets/index.ts';
import { TemplateService } from '../src/templates/index.ts';
import { PresetRuntimeServer } from '../src/runtime/preset-runtime-server.ts';
import {
  SidePanelPresetClient,
  blankPresetDraft,
  isPresetDraftDirty,
  isPresetDraftStale,
  normalizePresetDraftMode,
  presetDraftFrom,
  repeatRunWorkingCopyFromPreset,
} from '../src/ui/preset-workspace.ts';
import { createRepeatRunState } from '../src/runs/model.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const clone = (value) => structuredClone(value);
const ids = {
  template: '20000000-0000-4000-8000-000000000010',
  template2: '20000000-0000-4000-8000-000000000011',
  preset: '20000000-0000-4000-8000-000000000020',
  preset2: '20000000-0000-4000-8000-000000000021',
  queue: '20000000-0000-4000-8000-000000000030',
};
const nowValues = ['2026-08-24T03:46:00+08:00', '2026-08-24T03:47:00+08:00', '2026-08-24T03:48:00+08:00', '2026-08-24T03:49:00+08:00'];

function matchesIndex(store, index, value, query) {
  if (query === undefined) return true;
  if (index === 'byName') return value.name === query;
  if (index === 'byUpdatedAt') return value.updatedAt === query;
  if (store === 'queueItems' && index === 'byQueueId') return value.queueId === query;
  return false;
}

class MemoryDriver {
  state = new Map(PERSISTENCE_STORES.map((name) => [name, new Map()]));
  async transaction(_stores, mode, work) {
    const before = new Map([...this.state].map(([name, values]) => [name, new Map([...values].map(([key, value]) => [key, clone(value)]))]));
    const port = { store: (name) => ({
      get: async (key) => { const value = this.state.get(name).get(key); return value === undefined ? undefined : clone(value); },
      getAll: async () => [...this.state.get(name).values()].map(clone),
      getAllByIndex: async (indexName, query) => [...this.state.get(name).values()].filter((value) => matchesIndex(name, indexName, value, query)).map(clone),
      put: async (value) => { if (mode !== 'readwrite') throw new Error('readonly'); this.state.get(name).set(name === 'metadata' ? value.key : value.id, clone(value)); },
      delete: async (key) => { if (mode !== 'readwrite') throw new Error('readonly'); this.state.get(name).delete(key); },
    }) };
    try { return await work(port); } catch (error) { this.state = before; throw error; }
  }
  close() {}
}

async function createHarness() {
  const driver = new MemoryDriver();
  const repositories = new ApplicationRepositories(driver);
  let tick = 0;
  const now = () => nowValues[tick++] ?? nowValues.at(-1);
  const presets = new PresetService(repositories, now);
  const templates = new TemplateService(repositories, now);
  const template = await templates.create(ids.template, { name: 'Continue', body: 'Continue {iteration}/{total}', enabled: true });
  await repositories.write(['queues'], async (tx) => {
    await tx.repository('queues').put({ schemaVersion: 1, id: ids.queue, revision: 1, name: 'Primary queue', createdAt: nowValues[0], updatedAt: nowValues[0] });
  });
  return { driver, repositories, presets, templates, template };
}

const repeatInput = {
  name: 'Daily repeat', mode: 'repeat', templateId: ids.template, queueId: null,
  iterationCount: 7, delaySeconds: 9, autoContinue: true, autoScroll: false, preventDiscard: true,
};

const queueInput = {
  name: 'Queue batch', mode: 'queue', templateId: null, queueId: ids.queue,
  iterationCount: 1, delaySeconds: 12, autoContinue: false, autoScroll: true, preventDiscard: false,
};

test('STEP-11 preset contract requires exactly one mode-owned stable reference and bounded run defaults', () => {
  assert.deepEqual(requirePresetWriteInput(repeatInput), repeatInput);
  assert.deepEqual(requirePresetWriteInput(queueInput), queueInput);
  assert.throws(() => requirePresetWriteInput({ ...repeatInput, templateId: null }), /requires templateId/);
  assert.throws(() => requirePresetWriteInput({ ...queueInput, templateId: ids.template }), /requires queueId and no templateId/);
  assert.throws(() => requirePresetWriteInput({ ...repeatInput, delaySeconds: 4 }), /5 to 3600/);
});

test('STEP-11 PresetService creates stable IDs, monotonic revisions, and rejects missing references transactionally', async () => {
  const { presets } = await createHarness();
  const created = await presets.create(ids.preset, repeatInput);
  assert.equal(created.id, ids.preset);
  assert.equal(created.revision, 1);
  const updated = await presets.update(ids.preset, 1, { ...repeatInput, name: 'Renamed', iterationCount: 8 });
  assert.equal(updated.id, ids.preset);
  assert.equal(updated.revision, 2);
  await assert.rejects(() => presets.create(ids.preset2, { ...repeatInput, templateId: ids.template2 }), /reference does not exist/);
  assert.equal((await presets.list()).length, 1);
});

test('STEP-11 repeat hydration resolves the current Template and produces a disposable complete Run working copy', async () => {
  const { presets, templates } = await createHarness();
  const created = await presets.create(ids.preset, repeatInput);
  await templates.update(ids.template, 1, { name: 'Continue latest', body: 'Latest {iteration}/{total}', enabled: true });
  const hydration = await presets.hydrate(created.id);
  assert.equal(hydration.mode, 'repeat');
  assert.equal(hydration.template.revision, 2);
  assert.equal(hydration.messageTemplate, 'Latest {iteration}/{total}');
  const copy = repeatRunWorkingCopyFromPreset(hydration);
  assert.deepEqual(copy, {
    presetId: ids.preset, presetRevision: 1, messageTemplate: 'Latest {iteration}/{total}', totalIterations: 7,
    delaySeconds: 9, autoContinue: true, autoScroll: false, preventDiscard: true,
  });
  assert.equal(Object.isFrozen(copy), true);
});

test('STEP-11 queue-shaped presets are reference-valid now but remain explicitly outside Repeat execution until STEP-12', async () => {
  const { presets } = await createHarness();
  const created = await presets.create(ids.preset, queueInput);
  const hydration = await presets.hydrate(created.id);
  assert.equal(hydration.mode, 'queue');
  assert.equal(hydration.queue.id, ids.queue);
  assert.throws(() => repeatRunWorkingCopyFromPreset(hydration), /STEP-12/);
});

test('STEP-11 revision fences protect update/delete/duplicate and template deletion is blocked while referenced', async () => {
  const { presets, templates } = await createHarness();
  const created = await presets.create(ids.preset, repeatInput);
  const updated = await presets.update(created.id, created.revision, { ...repeatInput, delaySeconds: 10 });
  await assert.rejects(() => presets.update(updated.id, 1, repeatInput), /revision changed/);
  const duplicate = await presets.duplicate(updated.id, updated.revision, ids.preset2);
  assert.equal(duplicate.id, ids.preset2);
  assert.equal(duplicate.revision, 1);
  await assert.rejects(() => templates.delete(ids.template, 1), /referenced by a preset/);
  await presets.delete(updated.id, updated.revision);
  await presets.delete(duplicate.id, duplicate.revision);
  await templates.delete(ids.template, 1);
  assert.equal(await templates.get(ids.template), undefined);
});

test('STEP-11 working-copy helpers preserve dirty/stale edits and normalize mode-owned references', () => {
  const base = { schemaVersion: 1, id: ids.preset, revision: 3, ...repeatInput, createdAt: nowValues[0], updatedAt: nowValues[0] };
  const draft = presetDraftFrom(base);
  assert.equal(isPresetDraftDirty(draft, base), false);
  draft.name = 'Local edit';
  assert.equal(isPresetDraftDirty(draft, base), true);
  assert.equal(isPresetDraftStale(draft, { ...base, revision: 4 }), true);
  assert.equal(draft.name, 'Local edit');
  draft.mode = 'queue'; draft.queueId = ids.queue; normalizePresetDraftMode(draft);
  assert.equal(draft.templateId, null);
  assert.equal(draft.iterationCount, 1);
  const blank = blankPresetDraft();
  assert.equal(blank.mode, 'repeat');
  assert.equal(blank.preventDiscard, true);
});

test('STEP-11 runtime/client exposes bounded CRUD/reference/hydration operations and isolated preset invalidation', async () => {
  const { presets } = await createHarness();
  let invalidations = 0;
  const server = new PresetRuntimeServer(async () => presets, () => { invalidations += 1; });
  const client = new SidePanelPresetClient({ sendMessage: async (request) => await server.handle(request) });
  const draft = { ...blankPresetDraft(), ...repeatInput };
  const created = await client.create(draft);
  const refs = await client.references();
  assert.equal(refs.templates[0].id, ids.template);
  const hydration = await client.hydrate(created.id);
  assert.equal(hydration.mode, 'repeat');
  const changed = presetDraftFrom(created); changed.delaySeconds = 11;
  const updated = await client.update(changed);
  const duplicate = await client.duplicate(updated);
  await client.delete(updated);
  assert.notEqual(duplicate.id, updated.id);
  assert.equal(invalidations, 4);
  assert.deepEqual(Object.values(PRESET_RUNTIME_OPERATIONS).sort(), ['preset.create','preset.delete','preset.duplicate','preset.get','preset.hydrate','preset.list','preset.references','preset.update'].sort());
});

test('STEP-11 Side Panel reuses team-standard lifecycle and Run preset application stays explicit/direct-first', async () => {
  const app = await text('entrypoints/sidepanel/App.vue');
  for (const marker of ['preset-select', 'beginNewPreset', 'savePresetAs', 'updatePreset', 'resetPreset', 'duplicatePreset', 'deletePreset']) assert.match(app, new RegExp(marker));
  assert.match(app, /presetDirtyGuard/);
  assert.match(app, /presetStaleGuard/);
  assert.match(app, /id="run-preset"/);
  assert.match(app, /noPresetDirect/);
  assert.match(app, /@click="applyRunPreset"/);
  assert.match(app, /hasNonTerminalRun/);
  assert.match(app, /workspace-card__heading/);
  assert.match(app, /field-with-action/);
  assert.match(app, /class="actions"/);
});

test('STEP-11 preset/template invalidations remain isolated and all new UI copy is localized', async () => {
  const [types, panel, background, router, app, locale] = await Promise.all([
    text('src/control-plane/types.ts'), text('src/control-plane/panel-client.ts'), text('entrypoints/background.ts'), text('src/runtime/message-router.ts'), text('entrypoints/sidepanel/App.vue'), text('public/_locales/en/messages.json'),
  ]);
  assert.match(types, /'preset_changed'/);
  assert.match(panel, /'preset_changed'/);
  assert.match(background, /ports\.broadcast\('preset_changed'\)/);
  assert.match(router, /PRESET_RUNTIME_OPERATIONS/);
  assert.match(app, /reason === 'preset_changed'/);
  const messages = JSON.parse(locale);
  for (const key of ['presetLibrary','presetWorkingCopy','presetName','presetMode','applyPreset','preventDiscard','saveAs','updatePreset','resetPreset','duplicatePreset','deletePreset']) assert.equal(typeof messages[key]?.message, 'string');
});

test('STEP-11 preventDiscard is durable Run input wired to existing guard authority without schema/permission expansion', async () => {
  const [runModel, runTypes, runUi, runtime, coordinator, background, schema, config] = await Promise.all([
    text('src/runs/model.ts'), text('src/runs/types.ts'), text('src/ui/run-workspace.ts'), text('src/runtime/run-runtime-server.ts'), text('src/runs/repeat-coordinator.ts'), text('entrypoints/background.ts'), text('src/persistence/schema.ts'), text('wxt.config.ts'),
  ]);
  assert.equal(createRepeatRunState({ preventDiscard: false }).preventDiscard, false);
  assert.equal(createRepeatRunState().preventDiscard, true);
  assert.match(runTypes, /preventDiscard/);
  assert.match(runUi, /preventDiscard: draft\.preventDiscard/);
  assert.match(runtime, /preventDiscard: payload\.preventDiscard/);
  assert.match(coordinator, /discardGuards.*acquire/);
  assert.match(coordinator, /discardGuards.*release/);
  assert.match(background, /new RepeatRunCoordinator\(manager, client, waiter, scheduler, discardGuards\)/);
  assert.match(schema, /name: 'presets'/);
  assert.match(config, /permissions:\s*\[['"]sidePanel['"],\s*['"]storage['"],\s*['"]alarms['"]\]/);
  assert.doesNotMatch(routerSafe(runModel + runTypes), /eval\s*\(|new Function/);
});

function routerSafe(value) { return value; }
