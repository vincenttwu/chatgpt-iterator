# ChatGPT Iterator — v0.0.24

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows, with secondary toolbar and in-page runtime visibility/control surfaces.

## Product status

**ROADMAP-0001 is closed at v0.0.16. ROADMAP-0002 is active at v0.0.24 with 8/9 steps complete. Phase P1 — Safety Authority and Phase P2 — Runtime Visibility and Secondary Control are closed. Phase P3 — Drift/Retention and Closure is active at 1/2.**

`v0.0.24` completes **ROADMAP-0002 STEP-08 — Adapter Drift, Observation, Error Classification, and Data-Retention Hardening**. The sole next authorized implementation is:

**v0.0.25 / ROADMAP-0002 STEP-09 — Integrated Successor Hardening Closure**

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted planning/implementation lineage remains the source of truth; no byte-for-byte ancestry claim is fabricated.

## What v0.0.24 changes

- Reclassifies ChatGPT DOM knowledge into **structural anchors**, **transient capabilities**, and **diagnostic signals**.
- Makes the visible editable composer `#prompt-textarea[contenteditable="true"]` the structural send anchor. The hidden fallback textarea is never send authority.
- Treats Send/Stop/Continue/Voice as state-dependent capabilities: normal absence while idle does not degrade an otherwise healthy adapter.
- Adds structural preflight before composer write and again before the native send click, preserving the existing point-of-click conversation guard.
- Advances the ChatGPT adapter to **schema v4** with machine-readable degradation reasons for unsupported route, missing/ambiguous composer, unavailable capability, conversation mismatch, likely rate limit/page alert, and adapter drift.
- Keeps response observation MutationObserver/event-driven while coalescing busy-stream assistant-fingerprint-only changes to a bounded 250ms minimum publication interval. Completion/state changes remain immediate; no interval polling authority is introduced.
- Advances durable run/logical state to **v5** so terminal Repeat/Queue executions compact prompt-bearing content and clear transient active-response/delay fields.
- Preserves active/recovery prompt content until terminal transition, so worker/browser lifecycle recovery remains correct.
- Adds explicit logical migration `4 -> 5`; accepted v1/v2/v3/v4 run snapshots normalize through compatibility code and old terminal snapshots are compacted rather than silently retained.
- Keeps portable envelope **v1**. Current full backups contain compact terminal run state, and legacy embedded run states normalize on read. Configuration export continues to omit run history.
- Keeps diagnostics, History, toolbar projection and in-page controller projection prompt/assistant-text minimal.
- Introduces no new permission, host scope, popup, execution engine, dependency, physical IndexedDB version, or portable-envelope version.

## Schema and compatibility state

- Physical IndexedDB remains **v1**.
- Portable envelope remains **v1**.
- Global logical persistence is **v5**.
- Durable run state is **v5**, with explicit v1/v2/v3/v4 compatibility normalization.
- ChatGPT adapter snapshot schema is **v4**.
- Tab registry snapshot schema remains **v2**.
- In-page controller presentation protocol remains **v1**.
- Current terminal run content is compacted with an explicit sentinel; active/recovery state retains required message content until terminal transition.

## Runtime and presentation boundaries

The primary product remains the Side Panel with **Run · Queue · Presets · Templates · Settings**. Repeat and Queue share one durable coordinator. Sender, tab, conversation and generation authority remain fail-closed. Toolbar status and the mini controller consume the shared `RunPresentationProjection` and remain secondary presentation/control surfaces.

The ChatGPT adapter now distinguishes stable structural facts from transient control availability. Structural preflight—not the incidental presence of a Send button—determines whether send authority can proceed. Current ChatGPT selector evidence remains centralized under `src/chatgpt/` and is treated as drift-prone evidence rather than a permanent API.

## Data, privacy, and permissions

Declared permissions remain only `sidePanel`, `storage`, and `alarms`. Content scope remains only `https://chatgpt.com/*` and `https://chat.openai.com/*`. No `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, remote executable code, `eval`, conventional toolbar popup, or arbitrary template scripting is introduced.

Terminal run snapshots no longer retain Repeat message templates or resolved Queue item content after completion/failure/stop. Current full backups therefore carry compact terminal execution state; imported legacy v1 backups normalize accepted old run schemas before use. Full backups remain sensitive because they still contain configuration definitions, terminal metadata and event payloads.

## Validation

For v0.0.24:

- STEP-08 focused adapter/drift/retention suite: **11/11 PASS**;
- focused STEP-04-adapter + STEP-02-caller/privacy compatibility lanes: **18/18 PASS**;
- strict dependency-free TypeScript for changed source contracts: **PASS**;
- single STEP-07 predecessor smoke: **11/12** — the only failure was the retained static assertion that logical model must remain v4; all 11 controller docking/drag/accessibility behavior checks passed, and that superseded version assertion was reconciled for future accumulated runs;
- bounded streaming observation/coalescing: **PASS**;
- Repeat + Queue terminal prompt compaction: **PASS**;
- legacy v0.0.16-era run/full-backup normalization: **PASS**;
- physical DB/export-format stability and no-new-permission/popup/polling boundaries: **PASS**.

WXT/Vue hydrated build/package remains inherited **DEFERRED_ENVIRONMENT**. STEP-08 changes no dependencies and does not own package/install closure; STEP-09 owns the formal package/build/install closure lane.

## Architecture authority

- `ADR-0001` revision 6 preserves the four authority zones while recording the STEP-08 structural/capability and terminal-retention boundary.
- `CONSTRAINT-0001` remains active: CRSniffer team Side Panel grammar governs the primary product UI.
- `REFERENCE-0006` remains current evidence for the ChatGPT route/composer surface; selector evidence remains advisory, not API guarantee.
- `ROADMAP-0001` remains immutable closed history.
- `ROADMAP-0002` revision 8 is the active successor/semi-handoff authority and contains the exact STEP-09 closure continuation contract.

`dumps/donors/` remains immutable reference material and is not runtime code.
