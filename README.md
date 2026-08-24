# ChatGPT Iterator — v0.0.18

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows.

## Product status

**ROADMAP-0001 is closed at v0.0.16. ROADMAP-0002 is active at v0.0.18 with 2/9 steps complete.**

`v0.0.18` completes **ROADMAP-0002 STEP-02 — Runtime Caller Authority and Privacy-Minimal Adapter Contract**. The sole next authorized implementation is:

**v0.0.19 / ROADMAP-0002 STEP-03 — Conversation Identity and Wrong-Conversation Send Prevention**

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted planning/implementation lineage remains the source of truth; no byte-for-byte ancestry claim is fabricated.

## What v0.0.18 changes

- Background request authorization now derives/corroborates the caller from Chrome `MessageSender` instead of trusting only envelope `source`.
- Own-extension Side Panel callers and top-frame ChatGPT content callers are distinguished fail-closed; unexpected frames, origins and extension IDs are rejected.
- Content-origin background authority currently permits only adapter-state publication and uses the actual `sender.tab` identity.
- The future mini-controller authorization contract is intentionally narrow: Pause / Resume / Stop only, with no controller UI enabled yet.
- ChatGPT adapter schema is now **v2**: external snapshots expose `composerHasDraft` rather than raw draft text and `assistantFingerprint` rather than text-bearing assistant signatures.
- Raw composer reads stay inside the content adapter for send safety.
- Durable run state is now **v2** with `assistantBaselineFingerprint`.
- Global logical persistence is **v2** with explicit v1 -> v2 run migration; physical IndexedDB remains **v1**.
- Portable envelope remains **v1** and explicitly normalizes legacy run snapshots through compatibility parsing.
- Repeat/Queue orchestration, generation fencing, idempotency, Side Panel IA, permissions and host scope are unchanged.

## Current product surface

The primary product remains the Side Panel with **Run · Queue · Presets · Templates · Settings**. Run uses explicit ChatGPT target binding; Repeat and Queue share one recovery-aware coordinator; Templates/Presets/Queues are stable revisioned definitions; Settings includes diagnostics/history/data portability; browser-session resets require explicit target rebind before Resume.

ROADMAP-0002 is hardening-focused rather than workflow expansion. The remaining sequence is conversation identity, truthful timing/shared presentation projection, toolbar status, minimal in-page controller, accessible docking/dragging, adapter drift/retention hardening, then integrated closure.

## Data, privacy, and permissions

Declared permissions remain only `sidePanel`, `storage`, and `alarms`. Content scope remains only `https://chatgpt.com/*` and `https://chat.openai.com/*`. No `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, remote executable code, `eval`, or arbitrary template scripting is introduced.

Adapter/background observation payloads no longer serialize composer draft contents or assistant-text suffixes. Active run execution still retains the message content required for durable recovery; terminal content compaction is intentionally owned by ROADMAP-0002 STEP-08 rather than being pulled forward.

## Validation

For v0.0.18:

- STEP-02 focused caller/privacy/schema suite: **9/9 PASS**;
- strict dependency-free TypeScript across changed core/adapter/persistence/tabs/runs/runtime/portability domains: **PASS**;
- single predecessor smoke, STEP-08 Repeat/shared coordinator: **9/9 PASS**;
- physical DB remains v1; portable format remains v1; no permission or host-scope change.

WXT/Vue hydrated build/package remains inherited **DEFERRED_ENVIRONMENT** from the closed v0.0.16 environment because dependencies are still not hydrated and this step changed no dependency.

## Architecture authority

- `ADR-0001` revision 3 records sender-derived caller authority and privacy-minimal adapter/run evolution.
- `CONSTRAINT-0001` remains active: CRSniffer team Side Panel grammar governs applicable UI work.
- `ROADMAP-0001` remains immutable closed history.
- `ROADMAP-0002` is the active successor/handoff authority and contains the exact continuation contract.

`dumps/donors/` remains immutable reference material and is not runtime code.
