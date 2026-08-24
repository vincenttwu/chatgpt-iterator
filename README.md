# ChatGPT Iterator — v0.0.20

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows.

## Product status

**ROADMAP-0001 is closed at v0.0.16. ROADMAP-0002 is active at v0.0.20 with 4/9 steps complete. Phase P1 — Safety Authority is closed; Phase P2 — Runtime Visibility and Secondary Control is active at 1/4.**

`v0.0.20` completes **ROADMAP-0002 STEP-04 — Timing Semantics and Unified Run Presentation Projection**. The sole next authorized implementation is:

**v0.0.21 / ROADMAP-0002 STEP-05 — Toolbar Status and At-a-Glance Runtime Indicator**

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted planning/implementation lineage remains the source of truth; no byte-for-byte ancestry claim is fabricated.

## What v0.0.20 changes

- Pause during `waiting_delay` now persists a bounded **remaining duration** and clears the stale absolute due timestamp.
- Resume reconstructs a fresh `nextDueAt` from that frozen remainder, so time spent paused never consumes the configured delay.
- Worker recovery preserves a paused delay remainder without scheduling or duplicating it; browser-session/conversation suspensions entering a paused delay state preserve the same timing invariant.
- Waiting-response state now persists `responseStartedAt`, allowing elapsed response time to be shown without inventing a completion ETA.
- New pure `RunPresentationProjection` is the one shared state vocabulary for Side Panel, later toolbar status, and later in-page controller surfaces.
- The projection includes lifecycle label/tone, completed/total/current iteration, exact delay countdown or frozen remainder, response elapsed/indeterminate state, attention/rebind flags, and available actions.
- The Side Panel current-run card consumes this shared projection and adds a presentation-only display clock; execution remains event/scheduler driven.
- Semantic tones are centralized as `neutral`, `active`, `waiting`, `paused`, `attention`, `success`, and `error`; visible labels/warnings remain authoritative so color is never the only state signal.
- No toolbar badge, popup, or in-page controller is implemented early.

## Schema and compatibility state

- Physical IndexedDB remains **v1**.
- Portable envelope remains **v1**.
- Global logical persistence is **v4**.
- Durable run state is **v4** with explicit v1/v2/v3 compatibility normalization.
- ChatGPT adapter snapshot schema remains **v3**.
- Tab registry snapshot schema remains **v2**.
- Legacy v3 paused-delay snapshots are normalized by deriving the frozen remainder from their old due time and pause/update timestamp.

## Current product surface

The primary product remains the Side Panel with **Run · Queue · Presets · Templates · Settings**. Repeat and Queue still share one durable coordinator; tab-plus-conversation authority remains fail-closed; Settings retains diagnostics/history/data portability. STEP-04 only improves timing truth and presentation consistency.

The next phase step adds concise toolbar status while preserving toolbar click → Side Panel. The minimal in-page controller remains a later STEP-06 surface and is not an alternate execution authority.

## Data, privacy, and permissions

Declared permissions remain only `sidePanel`, `storage`, and `alarms`. Content scope remains only `https://chatgpt.com/*` and `https://chat.openai.com/*`. No `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, remote executable code, `eval`, or arbitrary template scripting is introduced.

P1 privacy/caller/conversation protections remain intact. The new presentation clock is local UI timing only and does not poll ChatGPT or drive run orchestration.

## Validation

For v0.0.20:

- STEP-04 focused timing/projection suite: **9/9 PASS**;
- strict dependency-free TypeScript across changed run/persistence/presentation contracts and Run workspace client: **PASS**;
- single predecessor smoke, STEP-03 conversation suite: **8/10**, with the two failures limited to retained historical assertions that schema advancement must stop at v3; those assertions were updated for future accumulated runs and were not rerun because the one smoke slot was already consumed;
- physical DB and portable format remain v1; no permission or host-scope change.

WXT/Vue hydrated build/package remains inherited **DEFERRED_ENVIRONMENT** because dependencies are still not hydrated and STEP-04 owns no package/install closure.

## Architecture authority

- `ADR-0001` revision 5 records frozen-delay timing authority and the shared presentation-projection boundary.
- `CONSTRAINT-0001` remains active: CRSniffer team Side Panel grammar governs applicable UI work.
- `ROADMAP-0001` remains immutable closed history.
- `ROADMAP-0002` is the active successor/handoff authority and contains the exact continuation contract.

`dumps/donors/` remains immutable reference material and is not runtime code.
