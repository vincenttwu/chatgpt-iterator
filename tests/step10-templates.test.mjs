import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSuccessResponse, requireMessageEnvelope } from '../src/core/index.ts';
import { ApplicationRepositories, PERSISTENCE_STORES } from '../src/persistence/index.ts';
import { MESSAGE_TEMPLATE_TOKENS, renderMessageTemplate, validateMessageTemplate } from '../src/messages/index.ts';
import { TemplateService, TEMPLATE_RUNTIME_OPERATIONS, TEMPLATE_VARIABLES } from '../src/templates/index.ts';
import { TemplateRuntimeServer } from '../src/runtime/template-runtime-server.ts';
import {
  SidePanelTemplateClient,
  blankTemplateDraft,
  isTemplateDraftDirty,
  isTemplateDraftStale,
  previewTemplateDraft,
  templateDraftFrom,
} from '../src/ui/template-workspace.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const clone = (value) => structuredClone(value);
const nowValues = ['2026-08-24T03:40:00+08:00', '2026-08-24T03:41:00+08:00', '2026-08-24T03:42:00+08:00', '2026-08-24T03:43:00+08:00'];
const ids = {
  a: '10000000-0000-4000-8000-000000000010',
  b: '10000000-0000-4000-8000-000000000011',
};

function matchesIndex(_store, index, value, query) {
  if (query === undefined) return true;
  if (index === 'byName') return value.name === query;
  if (index === 'byUpdatedAt') return value.updatedAt === query;
  return false;
}

class MemoryDriver {
  state = new Map(PERSISTENCE_STORES.map((name) => [name, new Map()]));
  async transaction(stores, mode, work) {
    const before = new Map([...this.state].map(([name, values]) => [name, new Map([...values].map(([key, value]) => [key, clone(value)]))]));
    const port = {
      store: (name) => ({
        get: async (key) => { const value = this.state.get(name).get(key); return value === undefined ? undefined : clone(value); },
        getAll: async () => [...this.state.get(name).values()].map(clone),
        getAllByIndex: async (indexName, query) => [...this.state.get(name).values()].filter((value) => matchesIndex(name, indexName, value, query)).map(clone),
        put: async (value) => { if (mode !== 'readwrite') throw new Error('readonly transaction'); this.state.get(name).set(name === 'metadata' ? value.key : value.id, clone(value)); },
        delete: async (key) => { if (mode !== 'readwrite') throw new Error('readonly transaction'); this.state.get(name).delete(key); },
      }),
    };
    try { return await work(port); } catch (error) { this.state = before; throw error; }
  }
  close() {}
}

function createService() {
  const driver = new MemoryDriver();
  const repositories = new ApplicationRepositories(driver);
  let index = 0;
  return { driver, repositories, service: new TemplateService(repositories, () => nowValues[index++] ?? nowValues.at(-1)) };
}

const validInput = { name: 'Continue loop', body: 'Continue {iteration}/{total}; remaining {remaining}; {timestamp}', enabled: true };

class FakeRuntime {
  requests = [];
  records = [{ schemaVersion: 1, id: ids.a, revision: 1, name: 'A', body: 'Continue {iteration}', enabled: true, createdAt: nowValues[0], updatedAt: nowValues[0] }];
  async sendMessage(raw) {
    const request = requireMessageEnvelope(raw);
    this.requests.push(request);
    const record = this.records[0];
    if (request.operation === TEMPLATE_RUNTIME_OPERATIONS.list) return createSuccessResponse(request, this.records);
    if (request.operation === TEMPLATE_RUNTIME_OPERATIONS.create) return createSuccessResponse(request, record);
    if (request.operation === TEMPLATE_RUNTIME_OPERATIONS.update) return createSuccessResponse(request, { ...record, revision: 2, name: request.payload.name, body: request.payload.body, enabled: request.payload.enabled });
    if (request.operation === TEMPLATE_RUNTIME_OPERATIONS.duplicate) return createSuccessResponse(request, { ...record, id: ids.b, name: 'A Copy' });
    if (request.operation === TEMPLATE_RUNTIME_OPERATIONS.delete) return createSuccessResponse(request, { deleted: true });
    throw new Error(`unexpected ${request.operation}`);
  }
}

test('STEP-10 bounded variable contract is exactly the executable Repeat grammar and preview uses the same renderer', () => {
  assert.deepEqual([...TEMPLATE_VARIABLES], ['iteration', 'total', 'remaining', 'timestamp']);
  assert.deepEqual([...MESSAGE_TEMPLATE_TOKENS], [...TEMPLATE_VARIABLES]);
  assert.deepEqual(validateMessageTemplate(validInput.body), ['iteration', 'total', 'remaining', 'timestamp']);
  const draft = { ...blankTemplateDraft(), name: validInput.name, body: validInput.body };
  const preview = previewTemplateDraft(draft);
  assert.equal(preview, 'Continue 2/5; remaining 3; 2026-08-24T00:00:00.000Z');
  assert.equal(preview, renderMessageTemplate(validInput.body, { iteration: 2, total: 5, remaining: 3, timestamp: '2026-08-24T00:00:00.000Z' }));
  assert.throws(() => validateMessageTemplate('do {script}'), /unsupported message template token/);
});

test('STEP-10 TemplateService creates stable-ID records and updates by monotonic revision rather than name identity', async () => {
  const { service } = createService();
  const created = await service.create(ids.a, validInput);
  assert.equal(created.id, ids.a);
  assert.equal(created.revision, 1);
  const renamed = await service.update(ids.a, 1, { ...validInput, name: 'Renamed without identity change' });
  assert.equal(renamed.id, ids.a);
  assert.equal(renamed.revision, 2);
  assert.equal(renamed.name, 'Renamed without identity change');
  assert.equal((await service.list())[0].id, ids.a);
});

test('STEP-10 stale revision fences prevent lost updates and preserve the saved record', async () => {
  const { service } = createService();
  await service.create(ids.a, validInput);
  await service.update(ids.a, 1, { ...validInput, body: 'Changed {iteration}' });
  await assert.rejects(() => service.update(ids.a, 1, { ...validInput, body: 'Stale overwrite' }), /revision changed/);
  await assert.rejects(() => service.delete(ids.a, 1), /revision changed/);
  assert.equal((await service.get(ids.a)).body, 'Changed {iteration}');
});

test('STEP-10 duplicate receives a new stable ID and delete removes only the revision-fenced source', async () => {
  const { service } = createService();
  const source = await service.create(ids.a, validInput);
  const duplicate = await service.duplicate(source.id, source.revision, ids.b);
  assert.equal(duplicate.id, ids.b);
  assert.equal(duplicate.revision, 1);
  assert.equal(duplicate.name, 'Continue loop Copy');
  assert.equal(duplicate.body, source.body);
  await service.delete(source.id, source.revision);
  assert.equal(await service.get(source.id), undefined);
  assert.equal((await service.get(ids.b)).id, ids.b);
});

test('STEP-10 working-copy helpers distinguish clean, dirty, and stale without overwriting local edits', () => {
  const source = { schemaVersion: 1, id: ids.a, revision: 3, name: 'A', body: 'Body {iteration}', enabled: true, createdAt: nowValues[0], updatedAt: nowValues[0] };
  const draft = templateDraftFrom(source);
  assert.equal(isTemplateDraftDirty(draft, source), false);
  draft.body = 'Local edit {iteration}';
  assert.equal(isTemplateDraftDirty(draft, source), true);
  assert.equal(isTemplateDraftStale(draft, { ...source, revision: 4 }), true);
  assert.equal(draft.body, 'Local edit {iteration}');
});

test('STEP-10 runtime server is sidepanel-only, request-ID stable for create/duplicate, and emits mutation invalidations', async () => {
  const { service } = createService();
  let invalidations = 0;
  const server = new TemplateRuntimeServer(async () => service, () => { invalidations += 1; });
  const runtime = { async sendMessage(request) { return await server.handle(request); } };
  const client = new SidePanelTemplateClient(runtime);
  const draft = { ...blankTemplateDraft(), name: validInput.name, body: validInput.body, enabled: true };
  const created = await client.create(draft);
  assert.match(created.id, /^[0-9a-f-]{36}$/i);
  const updatedDraft = templateDraftFrom(created); updatedDraft.body = 'Updated {iteration}';
  const updated = await client.update(updatedDraft);
  const duplicate = await client.duplicate(updated);
  await client.delete(updated);
  assert.notEqual(duplicate.id, updated.id);
  assert.equal(invalidations, 4);
});

test('STEP-10 Side Panel reuses the team-standard reusable-definition lifecycle and protects dirty/stale working copies', async () => {
  const app = await text('entrypoints/sidepanel/App.vue');
  for (const marker of ['template-select', 'beginNewTemplate', 'saveTemplateAs', 'updateTemplate', 'resetTemplate', 'duplicateTemplate', 'deleteTemplate']) assert.match(app, new RegExp(marker));
  assert.match(app, /templateDirtyGuard/);
  assert.match(app, /templateStaleGuard/);
  assert.match(app, /workspace-card__heading/);
  assert.match(app, /field-with-action/);
  assert.match(app, /field-stack/);
  assert.match(app, /actions/);
  assert.match(app, /preview-card/);
});

test('STEP-10 template invalidation is isolated and UI copy is localized', async () => {
  const [types, panel, background, router, app, locale] = await Promise.all([
    text('src/control-plane/types.ts'), text('src/control-plane/panel-client.ts'), text('entrypoints/background.ts'), text('src/runtime/message-router.ts'), text('entrypoints/sidepanel/App.vue'), text('public/_locales/en/messages.json'),
  ]);
  assert.match(types, /'template_changed'/);
  assert.match(panel, /'template_changed'/);
  assert.match(background, /ports\.broadcast\('template_changed'\)/);
  assert.match(router, /TEMPLATE_RUNTIME_OPERATIONS/);
  assert.match(router, /#templates/);
  assert.match(app, /reason === 'template_changed'/);
  const messages = JSON.parse(locale);
  for (const key of ['templateLibrary', 'templateWorkingCopy', 'templateName', 'templateBody', 'saveAs', 'updateTemplate', 'resetTemplate', 'duplicateTemplate', 'deleteTemplate']) assert.equal(typeof messages[key]?.message, 'string');
});

test('STEP-10 template domain introduces no scripting/eval DSL or schema/permission churn and remains separate from Queue execution', async () => {
  const [model, app, schema, config, pkg] = await Promise.all([
    text('src/templates/model.ts'), text('entrypoints/sidepanel/App.vue'), text('src/persistence/schema.ts'), text('wxt.config.ts'), text('package.json'),
  ]);
  assert.doesNotMatch(model, /\beval\s*\(|new Function|Function\s*\(/);
  assert.match(schema, /PHYSICAL_DB_VERSION/);
  assert.match(config, /permissions:\s*\[['"]sidePanel['"],\s*['"]storage['"],\s*['"]alarms['"]\]/);
  assert.equal(JSON.parse(pkg).dependencies.bootstrap, undefined);
  assert.doesNotMatch(model, /PresetService|preset\.create|preset\.update/);
  assert.doesNotMatch(app, /queue\.create|queue\.execute/);
});
