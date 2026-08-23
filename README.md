# ChatGPT Iterator — v0.0.15

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-15 is complete and **Phase P4 is active**. Portability and browser-lifecycle recovery are now hardened; STEP-16 remains the integrated product/UI/accessibility/package closure step.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.15

- Added browser-session identity using `chrome.storage.session` so a same-session service-worker restart is distinguished from a browser/extension-session reset.
- Same-session worker recovery preserves prepared waiting-response authority and persisted waiting-delay deadlines without blindly re-sending messages.
- Browser/session reset now pauses unfinished runs with durable `browser_session_reset` suspension reason and a new generation fence. Browser-session-scoped tab IDs are never trusted across that reset.
- Added explicit **Rebind selected target** flow. A session-reset run cannot Resume until the user binds a currently ready ChatGPT tab; rebind does not itself send or advance work.
- Added durable `reconnecting` state for loading/unavailable target re-handshake. Frozen/discarded/reconnecting targets suspend execution and recover their prior active state only after the registry reports a usable target again.
- Inactive-tab execution remains bound to the explicit stored target and never depends on whichever tab is currently active.
- Side Panel close/reopen remains presentation-only; durable background execution authority is unaffected.
- Persisted discard-guard provenance in `chrome.storage.session` preserves the original `autoDiscardable` value across service-worker reconstruction and restores it when terminal/paused ownership ends.
- Terminal, pause, target-close and reconstructed-worker paths all release discard ownership safely.
- The existing Repeat/Queue coordinator remains the single execution loop; no polling or second lifecycle engine was introduced.
- IndexedDB remains physical v1; portable/export format remains v1; Chrome permissions remain `sidePanel`, `storage`, `alarms`.

## Validation

- `npm run test:step15`: **10/10 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check for lifecycle/run/tab/runtime/UI contracts: **PASS** with TypeScript 5.8.3.
- Single STEP-14 portability predecessor smoke: **10/10 PASS**.
- Repository-controlled lifecycle simulations cover inactive targets, frozen/discarded/reload reconciliation, same-session worker restart, browser-session reset/rebind/no-resend recovery, Side Panel closure/reopen, and discard-guard restoration.
- Real packaged Chrome lane: **DEFERRED_ENVIRONMENT**. Chromium is present, but this accepted snapshot has no hydrated `node_modules`/WXT build, so there is no truthful packaged extension to launch in the browser harness.
- WXT dependency hydration/prepare/full Vue typecheck/build remain inherited **DEFERRED_ENVIRONMENT**.

## Next authorized step

ROADMAP-0001 **STEP-16 / v0.0.16 — Integrated Product/UI Standard/Accessibility/Package Closure**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. The CRSniffer Side Panel interaction grammar is an enforced team standard, not optional design inspiration.
