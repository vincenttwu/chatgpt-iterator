# ChatGPT Iterator — v0.0.16

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows.

## Product status

**ROADMAP-0001 is closed at v0.0.16.** All 16 planned foundation/product steps are complete. This closure does **not** automatically authorize v0.1.0 or a successor roadmap.

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted v0.0.1 planning overlay and explicitly authorized v0.0.2+ implementation lineage remain the forward source of truth; no byte-for-byte ancestry claim is fabricated.

## What the extension does

- Opens a global Side Panel with exactly **Run · Queue · Presets · Templates · Settings**.
- Binds runs to an explicit ChatGPT tab instead of whichever browser tab happens to be active.
- Executes durable **Repeat** and ordered **Queue** workflows through one recovery-aware coordinator.
- Supports pause/resume/stop, automatic Continue, bounded delays, target discard protection and truthful frozen/discarded/reconnecting states.
- Recovers safely across Side Panel closure, service-worker restart and target reload. Browser/extension-session reset pauses unfinished work and requires explicit target rebind before Resume.
- Stores Templates, Presets, Queues, runs and history in extension-origin IndexedDB; small preferences/session coordination use purpose-specific Chrome storage tiers.
- Provides privacy-safe diagnostics and bounded terminal-run history.
- Exports versioned configuration or an explicitly sensitive full backup; imports are previewed before Merge / Replace imported / Replace all is applied.

## Direct-first Run workflow

1. Open the extension Side Panel.
2. In **Run**, select the exact ready ChatGPT tab.
3. Keep **No preset — direct configuration**, or explicitly Apply a saved Preset.
4. Choose Repeat or Queue mode and configure the disposable working copy.
5. Start the run. Pause, Resume or Stop from the durable run card as needed.
6. If a browser/session reset occurs, select the intended ready ChatGPT tab, **Rebind selected target**, then Resume.

Templates, Presets and Queues use revision-safe working copies with explicit **New · Load · Save As · Update · Reset · Duplicate · Delete** lifecycle. Queue items use explicit **Move Up · Move Down · Remove** ordering rather than drag-only authority.

## UI and accessibility contract

CRSniffer remains the mandatory team Side Panel interaction standard. v0.0.16 records the integrated mapping in `agents/records/matrices/MATRIX-0001--integrated-team-side-panel-closure.md`.

The accepted surface provides roving keyboard tabs, one atomic polite status lane, visible focus, 2.75rem minimum control targets, 1.5rem checkbox controls inside clickable rows, narrow-panel reflow, icon-preserving tab compression, reduced-motion handling, forced-color compatibility, and system/native-aware light/dark colors. The fallback UI catalog and `public/_locales/en/messages.json` are exactly aligned at 298 keys/values.

## Data and permissions

Chrome 132+ is the supported baseline. Declared permissions remain only:

- `sidePanel`
- `storage`
- `alarms`

The content script is scoped only to `https://chatgpt.com/*` and `https://chat.openai.com/*`. Extension-page CSP is self-only (`script-src 'self'; object-src 'self';`). No `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, remote executable script, `eval`, or arbitrary template scripting is part of the product.

IndexedDB physical version is **v1**. Portable/export format is independently **v1**.

## Validation and build status

Repository-controlled closure verification passes:

- STEP-16 focused closure: **9/9 PASS**.
- Accumulated STEP-02 through STEP-16 suite: **133/133 PASS**.
- Strict dependency-free TypeScript: **PASS across 96 source files** with TypeScript 5.8.3 available in the execution environment.
- Minimal permission/CSP/no-remote-code, localization, accessibility/responsive and CRSniffer matrix inspections: **PASS**.

A fresh closure `npm install --ignore-scripts --no-audit --no-fund` attempt timed out after 120 seconds and produced neither `node_modules` nor a lockfile. Chromium is installed, but without hydrated WXT dependencies there is no generated extension bundle to launch. Therefore WXT prepare/full Vue typecheck/build/package and real Chrome install/upgrade smoke are **DEFERRED_ENVIRONMENT**, not reported as passes and not a roadmap blocker.

In an environment with npm package access, use the pinned toolchain in `package.json`:

```text
npm install
npm run prepare
npm run typecheck
npm run build
```

## Architecture authority

- `ADR-0001` remains accepted: Side Panel presentation, background/application authority, extension persistence and ChatGPT content adapter stay separated.
- `CONSTRAINT-0001` remains active: the CRSniffer team Side Panel grammar continues to govern future UI work.
- `ROADMAP-0001` is closed; further product work requires explicit authorization through a new or revised roadmap.

`dumps/donors/` is immutable reference material and is not runtime code.
