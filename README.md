# ChatGPT Iterator — v0.0.23

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows, with a secondary in-page status/controller that now supports accessible canonical docking and collision-safe placement.

## Product status

**ROADMAP-0001 is closed at v0.0.16. ROADMAP-0002 is active at v0.0.23 with 7/9 steps complete. Phase P1 — Safety Authority and Phase P2 — Runtime Visibility and Secondary Control are closed. Phase P3 — Drift/Retention and Closure is next.**

`v0.0.23` completes **ROADMAP-0002 STEP-07 — Mini Controller Docking, Dragging, Accessibility, and Position Recovery**. The sole next authorized implementation is:

**v0.0.24 / ROADMAP-0002 STEP-08 — Adapter Drift, Observation, Error Classification, and Data-Retention Hardening**

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted planning/implementation lineage remains the source of truth; no byte-for-byte ancestry claim is fabricated.

## What v0.0.23 changes

- Replaces the provisional fixed top-right mini-controller placement with six canonical docks: **top-left, middle-left, bottom-left, top-right, middle-right, bottom-right**.
- Persists only the canonical dock name plus collapse state in background-owned trusted local Chrome storage. Arbitrary pixel coordinates are never durable state.
- Adds optional pointer dragging from a dedicated handle. Drag release snaps to the same canonical dock vocabulary instead of storing freeform coordinates.
- Adds equivalent single-pointer placement controls for every dock plus **Reset position**; dragging is never required.
- Adds Arrow-key dock movement and Home reset on the drag handle as an additional keyboard path.
- Keeps the controller inside the visual viewport after resize/zoom and reacts to `visualViewport` resize/scroll plus controller-size changes.
- Adds a ChatGPT-owned layout advisor for the current sticky `#thread-bottom-container` with `[data-composer-surface="true"]` fallback. Presentation/content code does not duplicate those ChatGPT selectors.
- Bottom placements are transiently lifted above the sticky composer/control safe area when required; the requested canonical dock remains the saved preference and can return when the obstruction disappears.
- Corrupted placement preference falls back to safe **top-right**. Legacy v0.0.22 collapse-only records also normalize to top-right without a protocol or IndexedDB migration.
- Preserves the closed Shadow DOM, trusted-event action gate, one polite status region, 44px-class controls, visible focus, non-color state cues, reduced-motion and forced-colors behavior.
- Preserves sender/tab/window/conversation/generation authority, shared Pause/Resume/Stop execution, event-driven invalidation and presentation-only timing updates.
- Introduces no new workflow, execution engine, Chrome permission, host scope, dependency, toolbar popup, physical DB version, logical model version, run schema or portable format.

## Schema and compatibility state

- Physical IndexedDB remains **v1**.
- Portable envelope remains **v1**.
- Global logical persistence remains **v4**.
- Durable run state remains **v4** with explicit v1/v2/v3 compatibility normalization.
- ChatGPT adapter snapshot schema remains **v3**.
- Tab registry snapshot schema remains **v2**.
- In-page controller presentation protocol remains **v1**; `dock` is an additive field and is not durable application schema.
- `inpageController.v1` remains the trusted local UI-preference record; legacy collapse-only values normalize safely.

## Current product surface

The primary product remains the Side Panel with **Run · Queue · Presets · Templates · Settings**. Repeat and Queue share one durable coordinator; sender/tab/conversation authority remains fail-closed; toolbar status and the mini controller remain secondary presentation surfaces.

The in-page controller can show run state/progress/countdown and issue only the existing narrow Pause/Resume/Stop/Open Side Panel controls for one unambiguous local run. It cannot own run persistence, scheduling, message content, Queue content, Presets, Templates, history, configuration or ChatGPT execution state.

## Data, privacy, and permissions

Declared permissions remain only `sidePanel`, `storage`, and `alarms`. Content scope remains only `https://chatgpt.com/*` and `https://chat.openai.com/*`. No `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, remote executable code, `eval`, toolbar popup or arbitrary template scripting is introduced.

The mini-controller contract remains privacy-minimal. The new placement state is only a canonical dock enum; temporary viewport/controller/composer geometry remains content-local presentation data and is never persisted.

## Validation

For v0.0.23:

- STEP-07 focused docking/drag/accessibility/recovery suite: **12/12 PASS**;
- strict dependency-free TypeScript for changed presentation/layout contracts with `exactOptionalPropertyTypes`: **PASS**;
- strict dependency-free TypeScript for changed runtime server: **PASS**;
- content-entrypoint syntax: **PASS**;
- single predecessor smoke on untouched v0.0.22 STEP-06 before implementation: **10/10 PASS**;
- normalized-preference, no-free-coordinate, localization, no-popup/no-permission/no-schema/no-polling static boundaries: **PASS**.

WXT/Vue hydrated build/package remains inherited **DEFERRED_ENVIRONMENT** because dependencies are still not hydrated and STEP-07 does not own package/install closure.

## Architecture authority

- `ADR-0001` remains durable execution/presentation authority. Placement changes do not move authority into content.
- `CONSTRAINT-0001` remains active: CRSniffer team Side Panel grammar governs the primary product UI.
- `REFERENCE-0006` remains current evidence for the sticky ChatGPT composer surface; current selectors are advisory evidence rather than permanent API.
- `ROADMAP-0001` remains immutable closed history.
- `ROADMAP-0002` revision 7 is the active successor/semi-handoff authority and contains the exact STEP-08 continuation contract.

`dumps/donors/` remains immutable reference material and is not runtime code.
