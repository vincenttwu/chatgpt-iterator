# ChatGPT Iterator — v0.0.21

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows.

## Product status

**ROADMAP-0001 is closed at v0.0.16. ROADMAP-0002 is active at v0.0.21 with 5/9 steps complete. Phase P1 — Safety Authority is closed; Phase P2 — Runtime Visibility and Secondary Control is active at 2/4.**

`v0.0.21` completes **ROADMAP-0002 STEP-05 — Toolbar Status and At-a-Glance Runtime Indicator**. The sole next authorized implementation is:

**v0.0.22 / ROADMAP-0002 STEP-06 — Minimal In-Page Run Controller**

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted planning/implementation lineage remains the source of truth; no byte-for-byte ancestry claim is fabricated.

## What v0.0.21 changes

- Adds a background-owned toolbar status controller over the existing pure `RunPresentationProjection`; it does not create another lifecycle/state authority.
- A single nonterminal run shows concise progress when it fits the badge, `P` when paused, or `!` when attention/rebind is required.
- `action.setTitle()` provides the richer authoritative text: lifecycle, exact delay countdown or response elapsed time, current iteration, and attention explanation.
- Multiple simultaneous runs aggregate deterministically to a count globally and per tab rather than choosing an arbitrary run as canonical. A target tab with exactly one run receives that run's specific per-tab status.
- Terminal completion/failure and target changes clear stale global/per-tab badge/title state when no relevant nonterminal run remains.
- Manager changes and tab-registry changes refresh toolbar state; a fresh service worker reconstructs it from durable `manager.list()` state plus current tab targets.
- Delay/response time text refreshes at presentation boundaries with a display-only timer. It never queries ChatGPT, advances a delay, drives response observation, or becomes execution authority.
- Overlapping refresh requests are serialized so a stale projection cannot become the final toolbar state.
- Toolbar click still opens/toggles the Side Panel through `openPanelOnActionClick: true`; there is no `action.default_popup` and no popup entrypoint.
- Badge background color is not used as state authority; concise badge text and accessible title remain sufficient.

## Schema and compatibility state

- Physical IndexedDB remains **v1**.
- Portable envelope remains **v1**.
- Global logical persistence remains **v4**.
- Durable run state remains **v4** with explicit v1/v2/v3 compatibility normalization.
- ChatGPT adapter snapshot schema remains **v3**.
- Tab registry snapshot schema remains **v2**.

STEP-05 is presentation-only and requires no persisted-schema migration.

## Current product surface

The primary product remains the Side Panel with **Run · Queue · Presets · Templates · Settings**. Repeat and Queue still share one durable coordinator; sender/tab/conversation authority remains fail-closed; Settings retains diagnostics/history/data portability. The toolbar is only an at-a-glance secondary projection.

The next authorized step restores a minimal in-page controller inspired by the original Tampermonkey interaction shape, but it must remain secondary, sender-authorized, privacy-minimal, and non-durable. Freeform dragging/docking remains a later STEP-07 concern.

## Data, privacy, and permissions

Declared permissions remain only `sidePanel`, `storage`, and `alarms`. Content scope remains only `https://chatgpt.com/*` and `https://chat.openai.com/*`. No `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, remote executable code, `eval`, or arbitrary template scripting is introduced.

Toolbar status contains only presentation-safe run metadata. It does not expose prompt bodies, composer drafts, assistant text, history contents, or configuration payloads.

## Validation

For v0.0.21:

- STEP-05 focused toolbar-status suite: **9/9 PASS**;
- strict dependency-free TypeScript across shared presentation/run/tab contracts: **PASS**;
- single predecessor smoke, STEP-04 timing/projection suite: **9/9 PASS**;
- toolbar-click/Side Panel, no-popup, permission/host/schema/localization/status-boundary static checks: **PASS**.

WXT/Vue hydrated build/package remains inherited **DEFERRED_ENVIRONMENT** because dependencies are still not hydrated and STEP-05 owns no package/install closure.

## Architecture authority

- `ADR-0001` remains the durable execution/presentation authority; STEP-05 implements the already-approved secondary-projection boundary without changing ownership.
- `CONSTRAINT-0001` remains active: CRSniffer team Side Panel grammar governs applicable primary UI work.
- `ROADMAP-0001` remains immutable closed history.
- `ROADMAP-0002` revision 5 is the active successor/handoff authority and contains the exact continuation contract.

`dumps/donors/` remains immutable reference material and is not runtime code.
