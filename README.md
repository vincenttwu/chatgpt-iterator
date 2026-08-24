# ChatGPT Iterator — v0.0.19

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows.

## Product status

**ROADMAP-0001 is closed at v0.0.16. ROADMAP-0002 is active at v0.0.19 with 3/9 steps complete, and Phase P1 — Safety Authority is closed.**

`v0.0.19` completes **ROADMAP-0002 STEP-03 — Conversation Identity and Wrong-Conversation Send Prevention**. The sole next authorized implementation is:

**v0.0.20 / ROADMAP-0002 STEP-04 — Timing Semantics and Unified Run Presentation Projection**

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted planning/implementation lineage remains the source of truth; no byte-for-byte ancestry claim is fabricated.

## What v0.0.19 changes

- ChatGPT adapter snapshots now expose a semantic `ConversationContext` with `new_chat`, concrete `conversation`, or `unsupported` state.
- Run authority now binds independently to both `(tabId, windowId)` and a durable conversation binding.
- A run started on `/` may adopt exactly one first `/ -> /c/<id>` transition, then locks to that conversation identity.
- A same-tab `/c/A -> /c/B`, conversation -> new-chat, or supported -> unsupported transition suspends the run with `conversation_changed` before any further send.
- The shared Repeat/Queue coordinator performs the same conversation reconciliation; no mode-specific execution engine was introduced.
- ChatGPT send now receives the expected conversation context and verifies it again immediately before the native send click, closing the prepare-to-click SPA navigation race.
- Side Panel rebind verifies both selected target tab and current conversation before Resume becomes available.
- Browser-session-reset rebind preserves the prior session safety model and now validates conversation authority as well.
- A waiting-response mismatch is especially conservative: explicit rebind must return to the originally bound conversation because the prior send may already have occurred.
- Sidebar active-item DOM is not used as identity authority.

## Schema and compatibility state

- Physical IndexedDB remains **v1**.
- Portable envelope remains **v1**.
- Global logical persistence is **v3**.
- Durable run state is **v3** with explicit v1/v2 compatibility normalization.
- ChatGPT adapter snapshot schema is **v3**.
- Tab registry snapshot schema is **v2**.
- Legacy runs that have no trustworthy conversation identity normalize to an **unbound/fail-closed** binding rather than inventing one.

## Current product surface

The primary product remains the Side Panel with **Run · Queue · Presets · Templates · Settings**. Run uses explicit ChatGPT tab and conversation authority; Repeat and Queue share one recovery-aware coordinator; Templates/Presets/Queues are stable revisioned definitions; Settings includes diagnostics/history/data portability; browser-session resets require explicit rebind before Resume.

ROADMAP-0002 remains hardening-focused rather than workflow expansion. Phase P2 now owns truthful timing/shared presentation projection, toolbar status, the minimal in-page controller, and accessible docking/placement. Phase P3 then owns adapter drift/retention hardening and integrated closure.

## Data, privacy, and permissions

Declared permissions remain only `sidePanel`, `storage`, and `alarms`. Content scope remains only `https://chatgpt.com/*` and `https://chat.openai.com/*`. No `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, remote executable code, `eval`, or arbitrary template scripting is introduced.

STEP-02 privacy rules remain intact: adapter/background observation payloads do not serialize composer draft contents or assistant-text suffixes. STEP-03 conversation identity derives from URL/location semantics, not prompt/assistant text or sidebar titles.

## Validation

For v0.0.19:

- STEP-03 focused conversation-identity/suspension suite: **10/10 PASS**;
- strict dependency-free TypeScript across changed core/adapter/persistence/tabs/runs/runtime/UI domains: **PASS**;
- single predecessor smoke, STEP-02 caller/privacy suite: **9/9 PASS**;
- physical DB and portable format remain v1; no permission or host-scope change.

WXT/Vue hydrated build/package remains inherited **DEFERRED_ENVIRONMENT** because dependencies are still not hydrated and STEP-03 changes no dependency/toolchain authority.

## Architecture authority

- `ADR-0001` revision 4 records sender-derived caller authority, privacy-minimal adapter state, and durable tab-plus-conversation execution authority.
- `CONSTRAINT-0001` remains active: CRSniffer team Side Panel grammar governs applicable UI work.
- `ROADMAP-0001` remains immutable closed history.
- `ROADMAP-0002` is the active successor/handoff authority and contains the exact continuation contract.

`dumps/donors/` remains immutable reference material and is not runtime code.
