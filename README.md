# ChatGPT Iterator — v0.0.11

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-11 is complete and Phase P3 remains active. The product now includes the enforced team-standard **Presets** reusable-definition workspace and explicit Preset-to-Run hydration while keeping direct Run configuration first-class.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.11

- Added a persistence-backed Preset domain over the existing IndexedDB `presets` store without changing physical DB version or Chrome permissions.
- Added stable UUID preset identity and monotonic revision authority independent of editable names.
- Added Repeat and Queue-shaped preset configuration with stable Template/Queue ID references, iteration/delay defaults, auto-continue, auto-scroll and prevent-discard behavior.
- Added transactional reference validation on create/update/duplicate and fail-closed Template deletion while any Preset still references that Template.
- Added `preset.list/get/references/create/update/duplicate/delete/hydrate` background operations and isolated `preset_changed` invalidation.
- Repeat Preset hydration resolves the latest enabled referenced Template revision and returns a complete disposable Run working copy.
- Queue-shaped Presets are valid reusable configuration now, but Queue execution remains owned by STEP-12.
- Replaced the Presets placeholder with the CRSniffer team-standard reusable-definition lifecycle: **New · Load · Save As · Update · Reset · Duplicate · Delete**.
- Added dirty working-copy and stale-revision protection equivalent to Templates.
- Added an explicit **Apply** action in Run: applying a Preset changes only the local disposable Run draft and never silently mutates an active durable run.
- Presets remain optional; **No preset — direct configuration** remains a first-class Run path.
- Wired the existing `preventDiscard` Run setting into durable run state and the reference-counted tab discard guard so a Preset's tab-behavior default is operational rather than dead configuration.
- Retained native-aware, localized, narrow-panel, keyboard/focus, reduced-motion and forced-color team-standard UI behavior.

## Validation

- `npm run test:step11`: **10/10 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check for preset/domain/runtime/router/UI contracts: **PASS** with TypeScript 5.8.3.
- Single STEP-10 Templates predecessor smoke: **9/9 PASS**.
- IndexedDB physical version remains v1 and Chrome permission floor remains `sidePanel`, `storage`, `alarms`.
- WXT dependency hydration/prepare/full Vue typecheck/build remain inherited **DEFERRED_ENVIRONMENT**; no dependency changed and the unavailable package lane was not retried.

## Next authorized step

ROADMAP-0001 **STEP-12 / v0.0.12 — Queue Workspace and Queue Execution Mode**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. The CRSniffer Side Panel interaction grammar is an enforced team standard, not optional design inspiration.
