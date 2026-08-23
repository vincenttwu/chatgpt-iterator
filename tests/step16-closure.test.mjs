import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
async function text(path) { return readFile(new URL(path, ROOT), 'utf8'); }

function fallbackEntries(source) {
  const start = source.indexOf('const FALLBACK_MESSAGES = Object.freeze({');
  const end = source.indexOf('} as const);', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return Object.fromEntries([...source.slice(start, end).matchAll(/^\s{2}([A-Za-z0-9_]+): '([^']*)',/gm)]
    .map((match) => [match[1], match[2]]));
}

test('STEP-16 normal-user stories remain composed in the integrated five-workspace product', async () => {
  const app = await text('entrypoints/sidepanel/App.vue');
  const workspaces = await text('src/ui/workspaces.ts');
  assert.match(workspaces, /\['run', 'queue', 'presets', 'templates', 'settings'\]/);
  for (const token of [
    '@click="startNewRun"', "mutateCurrent('pause')", "mutateCurrent('resume')", "mutateCurrent('stop')",
    '@click="saveTemplateAs"', '@click="updateTemplate"', '@click="resetTemplate"', '@click="duplicateTemplate"', '@click="deleteTemplate"',
    '@click="savePresetAs"', '@click="updatePreset"', '@click="resetPreset"', '@click="duplicatePreset"', '@click="deletePreset"',
    '@click="moveQueueDraftItem(index,-1)"', '@click="moveQueueDraftItem(index,1)"', '@click="startNewRun"',
    "exportPortable('configuration')", "exportPortable('full_backup')", '@click="previewPortableImport"', '@click="applyPortableImport"',
    '@click="rebindCurrent"',
  ]) assert.match(app, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('STEP-16 accessibility contract has one polite status lane and keyboard-owned workspace tabs', async () => {
  const app = await text('entrypoints/sidepanel/App.vue');
  const template = app.slice(app.indexOf('<template>'));
  assert.equal((template.match(/role="status"/g) ?? []).length, 1);
  assert.equal((template.match(/aria-live="polite"/g) ?? []).length, 1);
  assert.match(template, /aria-atomic="true"/);
  assert.match(template, /role="tablist"/);
  assert.match(template, /v-for="workspace in WORKSPACES"[\s\S]*?role="tab"/);
  assert.match(template, /:aria-selected="activeWorkspace === workspace\.id"/);
  assert.match(template, /:tabindex="activeWorkspace === workspace\.id \? 0 : -1"/);
  assert.match(app, /ArrowRight/);
  assert.match(app, /ArrowLeft/);
  assert.match(app, /event\.key === 'Home'/);
  assert.match(app, /event\.key === 'End'/);
  assert.match(app, /liveStatusMessage/);
});

test('STEP-16 target sizing, narrow reflow, focus, reduced-motion and forced-color contracts match team authority', async () => {
  const css = await text('entrypoints/sidepanel/style.css');
  assert.match(css, /min-height:\s*2\.75rem/);
  assert.match(css, /\.check-row input\s*\{[\s\S]*?width:\s*1\.5rem;[\s\S]*?height:\s*1\.5rem;/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px solid var\(--focus\)/);
  assert.match(css, /scroll-margin-block:\s*1rem/);
  assert.match(css, /@media \(max-width:\s*320px\)/);
  assert.match(css, /@container app-shell \(max-width:\s*310px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media \(forced-colors:\s*active\)/);
  assert.match(css, /color-scheme:\s*light dark/);
  for (const systemColor of ['Canvas', 'CanvasText', 'Highlight', 'HighlightText']) assert.match(css, new RegExp(systemColor));
});

test('STEP-16 public locale exactly projects the complete fallback UI catalog', async () => {
  const source = await text('src/ui/messages.ts');
  const locale = JSON.parse(await text('public/_locales/en/messages.json'));
  const fallback = fallbackEntries(source);
  const keys = Object.keys(fallback);
  assert.deepEqual(Object.keys(locale).sort(), [...keys].sort());
  for (const key of keys) {
    assert.equal(locale[key]?.message, fallback[key], key);
  }
  for (const key of ['runStateReconnecting', 'targetReconnectExplanation', 'browserSessionResetExplanation', 'rebindTarget']) assert.ok(key in locale);
});

test('STEP-16 minimal-permission, CSP and no-remote-executable package contract remains explicit', async () => {
  const config = await text('wxt.config.ts');
  assert.match(config, /permissions:\s*\['sidePanel', 'storage', 'alarms'\]/);
  for (const forbidden of ['activeTab', 'debugger', 'scripting', '<all_urls>', 'unlimitedStorage']) assert.doesNotMatch(config, new RegExp(forbidden));
  assert.match(config, /script-src 'self'; object-src 'self';/);
  assert.doesNotMatch(config, /unsafe-eval|unsafe-inline|https?:\/\//);

  const roots = ['entrypoints', 'src'];
  const visit = async (relative) => {
    const entries = await readdir(new URL(`${relative}/`, ROOT), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) files.push(...await visit(child));
      else if (/\.(?:ts|vue|html|css)$/.test(entry.name)) files.push(child);
    }
    return files;
  };
  const files = (await Promise.all(roots.map(visit))).flat();
  for (const file of files) {
    const source = await text(file);
    assert.doesNotMatch(source, /(?:src|href|import\s*\()\s*[=(]?\s*["']https?:\/\//, file);
    assert.doesNotMatch(source, /chatgpt\.js|eval\s*\(|new Function\s*\(/, file);
  }
});

test('STEP-16 content adapter host scope stays limited to ChatGPT origins', async () => {
  const content = await text('entrypoints/chatgpt.content.ts');
  assert.match(content, /https:\/\/chatgpt\.com\/\*/);
  assert.match(content, /https:\/\/chat\.openai\.com\/\*/);
  assert.doesNotMatch(content, /<all_urls>|https:\/\/\*\/\*/);
});

test('STEP-16 CRSniffer closure matrix covers every mandatory constraint surface with no unexplained competing pattern', async () => {
  const matrix = await text('agents/records/matrices/MATRIX-0001--integrated-team-side-panel-closure.md');
  for (const phrase of [
    'Accessible roving tabs', 'Header/status lane', 'Reusable-definition lifecycle', 'Ordered-list interaction',
    'Narrow Side Panel compression', 'Minimum target sizing', 'Focus visibility', 'Reduced motion',
    'Forced/high-color compatibility', 'Localization-ready copy', 'Chrome-native-aware theming', 'Single polite live-status lane',
  ]) assert.match(matrix, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(matrix, /No competing interaction system/);
});

test('STEP-16 accumulated persistence and portability versions remain intentionally independent', async () => {
  const versions = await text('src/persistence/versions.ts');
  const portability = await text('src/portability/types.ts');
  assert.match(versions, /PHYSICAL_DB_VERSION\s*=\s*1/);
  assert.match(versions, /LOGICAL_MODEL_VERSION/);
  assert.match(versions, /EXPORT_FORMAT_VERSION\s*=\s*1/);
  assert.match(portability, /PORTABLE_FORMAT_VERSION\s*=\s*EXPORT_FORMAT_VERSION/);
});

test('STEP-16 closure does not authorize a successor roadmap or v0.1.0', async () => {
  const roadmap = await text('agents/records/roadmaps/ROADMAP-0001--chrome-native-iterator-foundation.md');
  assert.match(roadmap, /ROADMAP-0001 closes without automatically authorizing `v0\.1\.0` or a successor roadmap/);
  assert.doesNotMatch(roadmap, /STEP-17/);
});
