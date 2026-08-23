# ChatGPT Iterator — v0.0.6

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-06 is complete. Phase P2 is open with the extension persistence denominator now established before durable run semantics are introduced.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.6

- Extension-origin IndexedDB physical schema v1 with seven stores: metadata, templates, presets, queues, queue items, runs and run events.
- Explicit indexes for names/update time, queue membership/order and run-event sequencing without introducing a second database or page-local persistence path.
- Stable repository/domain record validation and JSON-safe cloning/freezing so IndexedDB internals do not leak upward as application authority.
- Atomic queue + queue-item replacement and a configuration mutation transaction boundary suitable for future import application.
- Physical DB version, logical model version and portable export-format version are separate authorities.
- Resumable post-open logical migration metadata is separate from short exclusive IndexedDB `versionchange` schema upgrades.
- Purpose-specific `chrome.storage.local`, `storage.session` and `storage.sync` adapters with project namespaces.
- Background initialization restricts all Chrome storage areas to trusted extension contexts and owns application IndexedDB bootstrap/migration.
- `storage` is added to the manifest permission floor; `unlimitedStorage` is not added.
- The ChatGPT content script has no application IndexedDB or `chrome.storage` access.
- STEP-07 run-state vocabulary is intentionally not pulled forward: v0.0.6 reserves a stable durable Run envelope while the state machine remains owned by the next iteration.

## Validation

- `npm run test:step06`: **8/8 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check across `src/core` + `src/persistence`: **PASS** with available TypeScript 5.8.3 and DOM IndexedDB types.
- STEP-05 tab lifecycle suite is the one narrow predecessor smoke for this iteration.
- WXT dependency hydration/prepare/full extension typecheck/build remain inherited **DEFERRED_ENVIRONMENT** from v0.0.2; no new dependency was added and the unavailable package lane was not retried.

## Next authorized step

ROADMAP-0001 **STEP-07 / v0.0.7 — Durable Run State Machine, Recovery and Command Semantics**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. Current Chrome extension storage/IndexedDB behavior and the v0.0.6 persistence disposition are recorded in `REFERENCE-0005`; donor persistence topology remains non-authoritative.
