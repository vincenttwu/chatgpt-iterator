# ChatGPT Iterator — v0.0.12

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-12 is complete and Phase P3 remains active. The product now supports both **Repeat** and **Queue** as sibling execution modes through one durable run lifecycle, and the Queue workspace follows the enforced CRSniffer team-standard reusable-definition and ordered-list interaction grammar.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.12

- Added a persistence-backed Queue domain over the existing IndexedDB `queues` and `queueItems` stores without changing physical DB version or Chrome permissions.
- Added stable UUID queue/item identity, monotonic queue revision authority and atomic whole-queue replacement.
- Queue items support exactly one literal message or reusable Template reference, enabled/disabled state and an optional per-item post-response delay override.
- Queue writes validate Template references transactionally; enabled Queue items cannot reference disabled Templates, Template deletion fails closed while Queue items reference it, and Queue deletion fails closed while a Preset references it.
- Added `queue.list/get/references/create/update/duplicate/delete/hydrate` background operations and isolated `queue_changed` invalidation.
- Queue hydration resolves enabled item content from current Template revisions; starting a Queue run freezes that resolved ordered list into durable run state so later Queue/Template edits do not silently alter active execution.
- Added `QueueMessageSource` as the mode-specific source beneath the same coordinator used by Repeat. Pause/resume/stop, duplicate-send fencing, response waiting, scheduling, worker recovery, frozen/discarded handling and discard guarding remain one lifecycle.
- Added Queue execution to server-side `run.create`; Side Panel callers provide the Queue ID rather than injecting arbitrary resolved queue content.
- Replaced the Queue placeholder with the team-standard **New · Load · Save As · Update · Reset · Duplicate · Delete** lifecycle plus explicit **Move Up · Move Down · Remove** controls and Add Item. Drag is not required for ordering.
- Added an explicit Run mode selector. Queue mode selects a saved Queue; Repeat mode retains direct message/iteration controls.
- Queue-shaped Presets now hydrate the disposable local Run draft and execute through Queue mode; applying a Preset still never mutates an active durable run.
- Retained native-aware, localized, narrow-panel, keyboard/focus, reduced-motion and forced-color team-standard UI behavior.

## Validation

- `npm run test:step12`: **10/10 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check for queue/domain/runtime/router/UI contracts: **PASS** with TypeScript 5.8.3.
- Single STEP-11 Presets predecessor smoke: **10/10 PASS**.
- IndexedDB physical version remains v1 and Chrome permission floor remains `sidePanel`, `storage`, `alarms`.
- WXT dependency hydration/prepare/full Vue typecheck/build remain inherited **DEFERRED_ENVIRONMENT**; no dependency changed and the unavailable package lane was not retried.

## Next authorized step

ROADMAP-0001 **STEP-13 / v0.0.13 — Settings, Diagnostics, History and Data Management Surface**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. The CRSniffer Side Panel interaction grammar is an enforced team standard, not optional design inspiration.
