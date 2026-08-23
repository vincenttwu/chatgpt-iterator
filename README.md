# ChatGPT Iterator — v0.0.10

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-10 is complete and Phase P3 remains active. The product now includes the enforced team-standard **Templates** reusable-definition workspace alongside the operational Run workspace.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.10

- Added a persistence-backed Template domain over the existing IndexedDB `templates` store without changing physical DB version or Chrome permissions.
- Added stable UUID template identity independent of editable names, plus monotonic revision authority.
- Added revision-fenced Update/Delete/Duplicate semantics that reject stale saved revisions instead of silently overwriting concurrent changes.
- Added `template.list/get/create/update/duplicate/delete` background operations; create/duplicate use request UUIDs as stable new entity IDs.
- Added isolated `template_changed` control-plane invalidation so template edits do not force tab/run hydration.
- Reused the exact Repeat message renderer and its bounded variables: `{iteration}`, `{total}`, `{remaining}`, `{timestamp}`.
- Added preview/validation with no JavaScript, eval, expression language, or remote executable code.
- Replaced the Templates placeholder with the CRSniffer team-standard reusable-definition lifecycle: **New · Load · Save As · Update · Reset · Duplicate · Delete**.
- Added dirty working-copy protection: New/Load cannot discard local edits silently.
- Added stale working-copy protection: external/newer saved revisions preserve local edits and require explicit Reset/reconciliation.
- Added localized template library/editor/preview/status copy and retained native-aware narrow-panel/accessibility behavior.
- Presets and Queue remain deferred to their owning roadmap steps.

## Validation

- `npm run test:step10`: **9/9 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check for template domain/runtime/router/UI contracts: **PASS** with TypeScript 5.8.3.
- Narrow STEP-09 team-standard shell/accessibility predecessor smoke: **2/2 PASS**.
- WXT dependency hydration/prepare/full Vue typecheck/build remain inherited **DEFERRED_ENVIRONMENT**; no dependency changed and the unavailable package lane was not retried.

## Next authorized step

ROADMAP-0001 **STEP-11 / v0.0.11 — Presets Workspace and Run Configuration Hydration**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. The CRSniffer Side Panel interaction grammar is an enforced team standard, not optional design inspiration.
