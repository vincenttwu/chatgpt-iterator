# ChatGPT Iterator — v0.0.25

Chrome-native Manifest V3 Side Panel controller for durable ChatGPT Repeat and Queue workflows, with secondary toolbar and in-page runtime visibility/control surfaces.

## Product status

**ROADMAP-0001 is closed at v0.0.16. ROADMAP-0002 is closed at v0.0.25 with 9/9 steps complete. P1 Safety Authority, P2 Runtime Visibility and Secondary Control, and P3 Drift/Retention and Closure are all complete.**

`v0.0.25` is the accepted **ROADMAP-0002 STEP-09 — Integrated Successor Hardening Closure**. It is a reconciliation/closure iteration: no new workflow, permission, host scope, popup, execution engine, physical storage format, portable format or automatic public-version promotion is introduced. There is **no next authorized version or roadmap**.

The originally requested `chatgpt-iterator-v0.0.0` archive never became available. The accepted planning/implementation lineage remains the source of truth; no byte-for-byte ancestry claim is fabricated.

## Successor hardening now closed

ROADMAP-0002 hardened the v0.0.16 product without multiplying workflow concepts:

- **Caller authority:** Chrome `MessageSender` determines Side Panel vs top-frame ChatGPT content authority; forged envelope `source` metadata is not trusted.
- **Wrong-conversation prevention:** runs bind to tab/window plus semantic conversation and generation; `/ -> /c/<id>` may bind once, later conversation drift suspends fail-closed, and the adapter rechecks conversation immediately before Send.
- **Privacy-minimal adapter:** raw composer drafts and assistant-text suffixes no longer cross into durable/background snapshots; adapter v4 exposes opaque fingerprints and machine-readable degradation reasons.
- **Truthful timing:** Pause freezes `remainingDelayMs`; Resume creates a fresh deadline; response activity reports elapsed/indeterminate time rather than a fabricated ETA.
- **Shared presentation vocabulary:** one `RunPresentationProjection` drives the Side Panel, toolbar badge/title and mini controller.
- **Toolbar status:** concise progress/paused/attention badge plus accessible title; toolbar click continues to open the Side Panel and no `default_popup` exists.
- **In-page controller:** compact closed-Shadow-DOM secondary controller with Pause/Resume/Stop/Open Side Panel, prompt-free projection, trusted-event controls and no durable authority.
- **Docking/accessibility:** six canonical docks, drag-to-snap plus non-drag/keyboard alternatives, reset, 44px-class targets, focus/reduced-motion/forced-colors behavior and transient composer/viewport collision recovery.
- **DOM drift/observation:** structural anchors are separated from transient capabilities and diagnostics; streaming fingerprint-only observations are event-driven and bounded/coalesced rather than mutation-for-mutation.
- **Terminal retention:** run/logical v5 compacts terminal Repeat/Queue prompt-bearing execution fields while retaining active/recovery content only as long as recovery requires.

## Schema and compatibility state

- Physical IndexedDB: **v1**.
- Portable envelope/export format: **v1**.
- Global logical persistence: **v5**.
- Durable run state: **v5**, with accepted v1/v2/v3/v4 normalization.
- ChatGPT adapter snapshot: **v4**.
- Tab registry snapshot: **v2**.
- In-page controller protocol: **v1**.

Logical evolution deliberately does not force a physical IndexedDB or portable-envelope bump. Current terminal run state is compacted; legacy accepted run/full-backup state normalizes through explicit adapters. Full backups remain sensitive because configuration definitions, metadata and event payloads remain.

## Runtime and presentation boundaries

The primary product remains the Side Panel with exactly **Run · Queue · Presets · Templates · Settings**. Repeat and Queue share one durable coordinator. Sender, tab, conversation and generation authority are fail-closed. Toolbar and mini controller are secondary projections and do not create another execution engine or durable state owner.

The ChatGPT adapter treats the visible exact `#prompt-textarea[contenteditable="true"]` as the send structural anchor. Send/Stop/Continue/Voice are transient capabilities and may legitimately be absent. Current ChatGPT selectors are evidence, not a permanent API; all selector knowledge remains centralized under `src/chatgpt/`.

## Data, privacy, permissions and code boundary

Declared permissions remain exactly `sidePanel`, `storage`, and `alarms`. Content scope remains only `https://chatgpt.com/*` and `https://chat.openai.com/*`. The extension does not add `activeTab`, `debugger`, `scripting`, `<all_urls>`, `unlimitedStorage`, a conventional toolbar popup, remote executable code, `eval` or `new Function`. Extension CSP remains self-only.

Default adapter, diagnostics, History, toolbar and mini-controller projections are prompt/assistant-text minimal. Terminal run snapshots compact prompt-bearing execution fields; active runs retain only the content needed for correct recovery until terminal transition.

## v0.0.25 closure evidence

- Initial accumulated closure run: **185/203**. Classification found 18 stale retained historical package/schema/UI-shape assertions and no current runtime product defect.
- Reconciled pre-closure accumulated suite: **203/203 PASS**.
- Dedicated STEP-09 integrated closure suite: **11/11 PASS**.
- Final accumulated repository suite: **214/214 PASS**.
- Strict dependency-free TypeScript: **PASS across 110 source files**; final static closure consistency: **52/52 PASS**.
- `MATRIX-0002` integrated hardening matrix: **ACCEPTED**.
- `AUDIT-0003` records the retained-test reconciliation and environment evidence.

One fresh `npm install --ignore-scripts --no-audit --no-fund` attempt timed out after 120 seconds and left neither `node_modules` nor `package-lock.json`. Chromium is present at `/usr/bin/chromium`, but no hydrated WXT build exists to launch. WXT prepare/full Vue typecheck/build/package and packaged-Chrome/real-ChatGPT smoke are therefore **DEFERRED_ENVIRONMENT**, not passes and not blockers.

## Architecture authority

- `ROADMAP-0002` revision **9** is closed at v0.0.25 and is the final successor/semi-handoff authority.
- `ADR-0001` revision **7** records the final event-driven/runtime/persistence authority boundaries.
- `CONSTRAINT-0001` revision **3** keeps the CRSniffer-derived Side Panel grammar authoritative for the primary UI while documenting the bounded accessible mini-controller deviation.
- `MATRIX-0002` and `AUDIT-0003` contain integrated closure evidence.
- `REFERENCE-0006` revision **2** records current Chrome/ChatGPT/environment evidence.
- `ROADMAP-0001` remains immutable closed history.

`dumps/donors/` remains immutable reference material and is not runtime code. Further development requires an explicitly authorized successor/superseding roadmap; **v0.0.26 and v0.1.0 are not automatically authorized**.
