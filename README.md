# ChatGPT Iterator — v0.0.17

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows.

## Product status

**ROADMAP-0001 is closed at v0.0.16. ROADMAP-0002 is now active at v0.0.17.**

`v0.0.17` is a planning/evidence-freeze iteration only: it records the successor hardening program without changing product/runtime behavior. The sole next authorized implementation is:

**v0.0.18 / ROADMAP-0002 STEP-02 — Runtime Caller Authority and Privacy-Minimal Adapter Contract**

ROADMAP-0002 is intentionally self-contained and includes a semi-handoff section with current architecture, identified gaps, user-provided current ChatGPT DOM evidence, proposed successor contracts, step acceptance criteria and continuation cautions.

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted v0.0.1 planning overlay and explicitly authorized v0.0.2+ implementation lineage remain the forward source of truth; no byte-for-byte ancestry claim is fabricated.

## Current accepted product baseline

The deployable/source behavior remains exactly the closed **v0.0.16** product baseline:

- global Side Panel with **Run · Queue · Presets · Templates · Settings**;
- explicit ChatGPT target tab binding rather than ambient active-tab execution;
- durable **Repeat** and ordered **Queue** workflows through one recovery-aware coordinator;
- pause/resume/stop, automatic Continue, bounded delays, discard protection and truthful frozen/discarded/reconnecting states;
- safe recovery across Side Panel closure, service-worker restart and target reload;
- browser/extension-session reset pauses unfinished work and requires explicit target rebind before Resume;
- stable/revisioned Templates, Presets and Queues in extension-origin IndexedDB;
- privacy-safe public diagnostics and bounded terminal history;
- versioned configuration export and explicitly sensitive full backup with preview-before-import Merge / Replace imported / Replace all.

## ROADMAP-0002 successor direction

The successor is **hardening + interaction-surface work**, not workflow expansion. Its priority order is:

1. sender-derived runtime caller authority and privacy-minimal adapter payloads;
2. conversation identity so same-tab ChatGPT navigation cannot send into the wrong conversation;
3. truthful pause/delay semantics and one shared run presentation projection;
4. toolbar badge/title status while preserving toolbar-click → Side Panel;
5. a minimal in-page Shadow DOM controller that recovers the original userscript's launcher/progress/Pause/Resume/Stop convenience without owning durable state;
6. accessible docking/optional dragging with composer-collision avoidance;
7. ChatGPT structural-vs-transient capability drift, observation coalescing and terminal data compaction;
8. integrated successor closure.

The implementation program runs from **v0.0.18 through v0.0.25**. No `v0.1.0` promotion is implied.

See:

- `agents/records/roadmaps/ROADMAP-0002--interaction-surface-and-runtime-hardening.md`
- `agents/records/audits/AUDIT-0002--v0-0-16-successor-hardening-evaluation.md`
- `agents/records/references/REFERENCE-0006--successor-hardening-current-authority.md`

## Direct-first Run workflow

1. Open the extension Side Panel.
2. In **Run**, select the exact ready ChatGPT tab.
3. Keep **No preset — direct configuration**, or explicitly Apply a saved Preset.
4. Choose Repeat or Queue mode and configure the disposable working copy.
5. Start the run. Pause, Resume or Stop from the durable run card as needed.
6. If a browser/session reset occurs, select the intended ready ChatGPT tab, **Rebind selected target**, then Resume.

Templates, Presets and Queues use revision-safe working copies with explicit **New · Load · Save As · Update · Reset · Duplicate · Delete** lifecycle. Queue items use explicit **Move Up · Move Down · Remove** ordering rather than drag-only authority.

## UI and accessibility contract

CRSniffer remains the mandatory team Side Panel interaction standard. `agents/records/matrices/MATRIX-0001--integrated-team-side-panel-closure.md` records the v0.0.16 integrated mapping.

The accepted Side Panel provides roving keyboard tabs, one atomic polite status lane, visible focus, 2.75rem minimum control targets, 1.5rem checkbox controls inside clickable rows, narrow-panel reflow, icon-preserving tab compression, reduced-motion handling, forced-color compatibility, and system/native-aware light/dark colors.

ROADMAP-0002 may add a **secondary in-page mini controller**, but it must remain a projection/client of background application authority. It does not replace the Side Panel and may not become durable execution authority. Optional dragging must have non-drag dock/snap/reset alternatives.

## Data and permissions

Chrome 132+ is the supported baseline. Declared permissions remain only:

- `sidePanel`
- `storage`
- `alarms`

The content script is scoped only to `https://chatgpt.com/*` and `https://chat.openai.com/*`. Extension-page CSP is self-only (`script-src 'self'; object-src 'self';`). No `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, remote executable script, `eval`, or arbitrary template scripting is part of the current product.

IndexedDB physical version remains **v1**. Portable/export format remains **v1** at roadmap opening. ROADMAP-0002 may evolve logical run/adapter/portable schemas only through explicit compatibility handling.

## Validation and build status

`v0.0.17` changes records/version identity only; product/runtime/test source is intentionally unchanged from v0.0.16.

Inherited v0.0.16 repository-controlled closure evidence:

- STEP-16 focused closure: **9/9 PASS**;
- accumulated STEP-02 through STEP-16 suite: **133/133 PASS**;
- strict dependency-free TypeScript: **PASS across 96 source files**;
- minimal permission/CSP/no-remote-code, localization, accessibility/responsive and CRSniffer matrix inspections: **PASS**.

The planning iteration does not re-run that full product suite merely to certify unchanged product source.

A fresh v0.0.16 closure npm hydration attempt timed out after 120 seconds and produced neither `node_modules` nor a lockfile. WXT prepare/full Vue typecheck/build/package and real Chrome install/upgrade remain inherited **DEFERRED_ENVIRONMENT** until the environment materially changes.

## Architecture authority

- `ADR-0001` remains accepted: Side Panel presentation, background/application authority, extension persistence and ChatGPT content adapter stay separated.
- `CONSTRAINT-0001` remains active: the CRSniffer team Side Panel grammar continues to govern applicable UI work.
- `ROADMAP-0001` remains immutable closed history.
- `ROADMAP-0002` is the active successor authority.

`dumps/donors/` is immutable reference material and is not runtime code.
