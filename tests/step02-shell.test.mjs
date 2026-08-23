import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('STEP-02 pins the refreshed WXT/Vue/TypeScript foundation', async () => {
  const pkg = JSON.parse(await text('package.json'));
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  assert.equal(major, 0);
  assert.equal(minor, 0);
  assert.ok(patch >= 2, 'the STEP-02 foundation must remain in every authorized successor');
  assert.equal(pkg.dependencies.vue, '3.5.41');
  assert.equal(pkg.devDependencies.wxt, '0.21.4');
  assert.equal(pkg.devDependencies['@wxt-dev/module-vue'], '1.0.3');
  assert.equal(pkg.devDependencies.typescript, '7.0.2');
  assert.equal(pkg.devDependencies['vue-tsc'], '3.3.11');
  assert.equal(pkg.dependencies.bootstrap, undefined);
  assert.equal(pkg.devDependencies.bootstrap, undefined);
});

test('STEP-02 manifest authority is Chrome 132+ with a minimal Side Panel permission floor', async () => {
  const config = await text('wxt.config.ts');
  assert.match(config, /minimum_chrome_version:\s*'132'/);
  assert.match(config, /permissions:\s*\[[^\]]*'sidePanel'[^\]]*\]/);
  assert.doesNotMatch(config, /host_permissions/);
  assert.doesNotMatch(config, /optional_host_permissions/);
  assert.doesNotMatch(config, /debugger/);
  assert.doesNotMatch(config, /activeTab/);
  assert.doesNotMatch(config, /scripting/);
});

test('STEP-02 toolbar action opens the global Side Panel', async () => {
  const background = await text('entrypoints/background.ts');
  assert.match(background, /sidePanel\?\.setPanelBehavior/);
  assert.match(background, /openPanelOnActionClick:\s*true/);
});

test('STEP-02 shell exposes exactly the five team-standard accessible workspaces', async () => {
  const app = await text('entrypoints/sidepanel/App.vue');
  const workspaces = await text('src/ui/workspaces.ts');
  assert.match(workspaces, /\['run', 'queue', 'presets', 'templates', 'settings'\]/);
  assert.match(app, /role="tablist"/);
  assert.match(app, /role="tab"/);
  assert.match(app, /role="tabpanel"/);
  assert.match(app, /:aria-selected=/);
  assert.match(app, /:tabindex=/);
  assert.match(app, /@keydown="onTabKeydown/);
  assert.match(app, /role="status"/);
  assert.match(app, /aria-live="polite"/);
});

test('STEP-02 shell preserves native-aware responsive and accessibility contracts', async () => {
  const css = await text('entrypoints/sidepanel/style.css');
  assert.match(css, /color-scheme:\s*light dark/);
  assert.match(css, /--bg:\s*Canvas/);
  assert.match(css, /--text:\s*CanvasText/);
  assert.match(css, /--accent:\s*Highlight/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*2\.75rem/);
  assert.match(css, /@media \(max-width:\s*320px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media \(forced-colors:\s*active\)/);
  assert.match(css, /@container app-shell \(max-width:\s*310px\)/);
});

test('STEP-02 UI copy is externalized through localization messages', async () => {
  const locale = JSON.parse(await text('public/_locales/en/messages.json'));
  for (const key of ['appName', 'run', 'queue', 'presets', 'templates', 'settings']) {
    assert.equal(typeof locale[key]?.message, 'string');
    assert.ok(locale[key].message.length > 0);
  }
});
