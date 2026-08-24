# ChatGPT Iterator — v0.0.22

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows, now with a minimal secondary in-page run controller.

## Product status

**ROADMAP-0001 is closed at v0.0.16. ROADMAP-0002 is active at v0.0.22 with 6/9 steps complete. Phase P1 — Safety Authority is closed; Phase P2 — Runtime Visibility and Secondary Control is active at 3/4.**

`v0.0.22` completes **ROADMAP-0002 STEP-06 — Minimal In-Page Run Controller**. The sole next authorized implementation is:

**v0.0.23 / ROADMAP-0002 STEP-07 — Mini Controller Docking, Dragging, Accessibility, and Position Recovery**

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted planning/implementation lineage remains the source of truth; no byte-for-byte ancestry claim is fabricated.

## What v0.0.22 changes

- Restores the original Tampermonkey interaction shape as a **secondary** compact in-page controller while preserving the Side Panel as the full product surface.
- Appends one controller host directly under `document.documentElement` and renders the UI in a **closed Shadow DOM** so ChatGPT CSS/DOM cannot casually reach into the controller internals.
- Defaults to a compact launcher/status pill and expands to a small card with lifecycle, progress, current iteration, exact delay countdown or response elapsed time.
- Uses the existing shared `RunPresentationProjection`; the Side Panel, toolbar, and in-page controller do not maintain separate lifecycle vocabularies.
- Exposes only **Pause · Resume · Stop · Open Side Panel** for one unambiguous nonterminal run targeting the verified local ChatGPT tab.
- Multiple nonterminal runs on the same tab deliberately become read-only ambiguity in the mini surface; the controller never guesses which run is canonical.
- In-page status contains only presentation-safe metadata plus run ID/generation fence. Prompt bodies, Queue item content, active message, composer draft, assistant text, history and configuration payloads are not exported to the mini controller.
- Background caller authority still comes from Chrome `MessageSender`. Mini commands are same-tab/window bounded and generation fenced; forged `source` metadata cannot elevate a content caller.
- Resume re-checks the current ChatGPT conversation before continuing. Wrong-conversation Resume fails closed and directs the user to the Side Panel for explicit rebind; Stop remains safely available for the run bound to the current tab.
- Side Panel and mini-controller Pause/Resume/Stop now share `src/runtime/run-control.ts`, so the mini surface does not create another execution path.
- Run mutations push lightweight invalidation hints to ChatGPT tabs. Delay/response seconds advance locally from the safe projection using display-only boundary `setTimeout`s; no ChatGPT polling or execution scheduler exists in content.
- Collapse state is a small **background-owned** trusted local-storage preference (`inpageController.v1`); content scripts still have no direct extension-storage ownership.
- Native buttons require trusted user events, expanded mode has one atomic polite status region, Escape collapses the card, and controls use a 44px-class minimum height.
- **Open Side Panel** uses `sidePanel.open({tabId})` from the verified user-initiated page action. Toolbar click continues to open/toggle the Side Panel through `openPanelOnActionClick`.
- The optional Start-default-Preset shortcut remains absent because Settings has no explicit mini-controller quick-start opt-in.
- Freeform dragging, canonical docking/snap, composer-collision avoidance, viewport/zoom recovery and normalized placement persistence remain STEP-07.

## Schema and compatibility state

- Physical IndexedDB remains **v1**.
- Portable envelope remains **v1**.
- Global logical persistence remains **v4**.
- Durable run state remains **v4** with explicit v1/v2/v3 compatibility normalization.
- ChatGPT adapter snapshot schema remains **v3**.
- Tab registry snapshot schema remains **v2**.
- In-page controller presentation contract is **v1**, but it is not a durable application schema and requires no IndexedDB migration.

## Current product surface

The primary product remains the Side Panel with **Run · Queue · Presets · Templates · Settings**. Repeat and Queue share one durable coordinator; sender/tab/conversation authority remains fail-closed; toolbar status remains secondary. The new in-page mini controller is a disposable operational projection only—removing or reloading it cannot stop, resume, schedule or corrupt a durable run.

The next step owns real placement ergonomics: canonical docking/snap, optional accessible dragging, non-drag placement controls, sticky-composer collision avoidance and viewport/zoom recovery.

## Data, privacy, and permissions

Declared permissions remain only `sidePanel`, `storage`, and `alarms`. Content scope remains only `https://chatgpt.com/*` and `https://chat.openai.com/*`. No `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, remote executable code, `eval`, toolbar popup, or arbitrary template scripting is introduced.

The in-page status contract is intentionally privacy-minimal and contains no prompt/history body data. Content scripts remain excluded from direct extension storage by the existing trusted-context storage access policy.

## Validation

For v0.0.22:

- STEP-06 focused in-page-controller suite: **10/10 PASS**;
- strict dependency-free TypeScript across changed presentation/runtime contracts: **PASS**;
- single predecessor smoke, STEP-05 toolbar-status suite: **9/9 PASS**;
- sender/tab/generation/conversation authority, shared projection, closed Shadow DOM/trusted-event, localization/no-popup/no-permission/no-schema static boundaries: **PASS**.

WXT/Vue hydrated build/package remains inherited **DEFERRED_ENVIRONMENT** because dependencies are still not hydrated and STEP-06 does not own package/install closure.

## Architecture authority

- `ADR-0001` remains the durable execution/presentation authority. The mini controller is an authorized secondary projection and does not alter background ownership.
- `CONSTRAINT-0001` remains active: CRSniffer team Side Panel grammar governs the primary product UI.
- `REFERENCE-0006` remains current authority for the current ChatGPT surface and Chrome Side Panel user-interaction behavior.
- `ROADMAP-0001` remains immutable closed history.
- `ROADMAP-0002` revision 6 is the active successor/handoff authority and contains the exact STEP-07 continuation contract.

`dumps/donors/` remains immutable reference material and is not runtime code.
