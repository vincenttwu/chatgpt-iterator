# ChatGPT Iterator — v0.0.3

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-03 is complete. This version establishes the versioned cross-context contract and reconstructable Side Panel control plane that later ChatGPT/tab/run domains will use.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and v0.0.2 executable shell remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.3

- Dependency-free `src/core/` contract layer with strict JSON-safe values, UUID-v4 stable IDs, protocol/schema versions, request correlation, runtime source/target context and query/command intent.
- Normalized bounded error categories/codes and versioned error payloads.
- Background-owned `ControlPlaneAuthority` and bounded `panel.hydrate` query server.
- Ephemeral Port invalidation hints that carry no canonical snapshot state.
- Side Panel hydration with response correlation and latest-request/out-of-order protection.
- Reconnect scheduling and rehydration after Port disconnect; panel closure/reopen reconstructs from background authority.
- Existing five-tab CRSniffer-standard Side Panel now presents control-plane connection/revision status without becoming canonical.
- No ChatGPT content script, selector registry, host/scripting permission, IndexedDB, run engine or Queue behavior yet.

## Validation

- `npm run test:step03`: **8/8 PASS** using Node's TypeScript stripping lane.
- Dependency-free `src/core/*.ts` + `src/control-plane/*.ts` strict TypeScript check: **PASS** with available TypeScript 5.8.3.
- STEP-02 shell regression smoke is retained as the one narrow predecessor check for this iteration.
- WXT dependency hydration/prepare/full extension typecheck/build remain inherited **DEFERRED_ENVIRONMENT** from v0.0.2; they are not reported as passes.

## Next authorized step

ROADMAP-0001 **STEP-04 / v0.0.4 — ChatGPT Adapter, Selector Registry, Observation and Diagnostics Contract**.

## Reference inputs

`dumps/donors/` remains read-only reference material. Product source owns its own contracts and implementation.
