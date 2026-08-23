# ChatGPT Iterator — v0.0.5

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-05 is complete and Phase P1 is closed. This version makes ChatGPT browser tabs explicit background-owned targets rather than implicitly following whichever tab is active.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.5

- Background-owned `ChatGptTabRegistry` discovers eligible ChatGPT tabs and combines browser lifecycle facts with STEP-04 adapter readiness/capability state.
- Explicit target binding records `tabId` + `windowId`; changing the active browser tab never silently retargets the binding.
- Normalized target lifecycle: `ready`, `degraded`, `loading`, `frozen`, `discarded`, and `unavailable`.
- Explicit close/navigation/replacement terminal facts; close clears the binding instead of leaving an operation hanging.
- Browser replacement may transfer the same logical binding to the replacement ChatGPT tab.
- Reload recovery is event-driven: the content adapter publishes bounded `tabs.adapterstate` updates when its semantic state changes, reconnecting the same target after document reload.
- `TabLifecycleCoordinator` owns `onUpdated`, `onRemoved`, `onReplaced`, and active-tab presentation updates.
- `AutoDiscardGuardManager` is reference-counted for future Run ownership, sets `autoDiscardable=false` only while owned, and restores the original value after the final release.
- Control-plane hydration now includes the bounded tab-registry snapshot; invalidation remains hint-only.
- No broad `tabs` permission is added, and no persistence/run engine/Repeat/Queue behavior is pulled forward.

## Validation

- `npm run test:step05`: **9/9 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check across `src/core`, ChatGPT contract types, `src/tabs`, `src/runtime`, and `src/control-plane`: **PASS** with available TypeScript 5.8.3.
- STEP-04 adapter suite is the one narrow predecessor smoke for this iteration.
- WXT dependency hydration/prepare/full extension typecheck/build remain inherited **DEFERRED_ENVIRONMENT** from v0.0.2; they are not reported as passes.

## Next authorized step

ROADMAP-0001 **STEP-06 / v0.0.6 — IndexedDB v1, Repositories, Storage Tiers and Migration Authority**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. Current Chrome Tabs lifecycle behavior is recorded in `REFERENCE-0004`; the userscript remains behavior/selector evidence only.
