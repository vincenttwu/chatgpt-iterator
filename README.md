# ChatGPT Iterator — v0.0.14

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-14 is complete and **Phase P4 is active**. The five top-level workspaces remain **Run · Queue · Presets · Templates · Settings**, with Settings/Data now owning real portability workflows rather than placeholders.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.14

- Added portable format v1 with explicit product, format version, app version, export timestamp, and configuration/full-backup kind.
- Configuration export contains Templates, Presets, nested ordered Queues, and sync-safe Settings; terminal Run History is excluded by default.
- Full Backup additionally carries terminal durable run snapshots and run-event payloads. It never exports nonterminal runs as history and is explicitly labeled sensitive.
- Added untrusted-import validation and a required preview showing counts, stable-ID conflicts, source version, and warnings before Apply is enabled.
- Added explicit **Merge · Replace imported records · Replace all** semantics. Replace All replaces configuration and, for full backups, terminal history while preserving active/nonterminal runs.
- Import validates references against the candidate post-import state, preserves stable IDs, and rejects active-run/history ID collisions.
- Added stale preview fencing: local data changes after preview require a new preview before mutation.
- Added compensating cross-store rollback for sync Settings + IndexedDB. A failed durable transaction restores the exact prior Settings snapshot; IndexedDB application itself is one transaction.
- Added an explicit import-adapter registry tied to portable format version. No accepted pre-v1 export existed, so unknown older formats are rejected instead of guessed or silently coerced.
- Added team-standard Data UI actions for configuration export, full backup, local JSON file selection, conflict-mode selection, preview, warnings, and explicit Apply.
- First-read default Settings are persisted once so revision/timestamp identity is stable for rollback and conflict planning.
- Fixed Side Panel invalidation parsing for the already-defined `settings_changed` and `history_changed` reasons.
- IndexedDB remains physical v1; portable/export format remains v1; Chrome permissions remain `sidePanel`, `storage`, `alarms`.

## Validation

- `npm run test:step14`: **10/10 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check for portability/runtime/UI/settings contracts: **PASS** with TypeScript 5.8.3.
- Single STEP-13 predecessor smoke: **9/10**; nine unaffected checks passed and the sole failure was its historical negative assertion that STEP-14 source must not exist. That retained assertion is updated in this version but was not rerun under the one-smoke fast-path limit.
- Final version/roadmap/schema/permission/localization/preview-before-apply consistency: **PASS**.
- WXT dependency hydration/prepare/full Vue typecheck/build remain inherited **DEFERRED_ENVIRONMENT**; no dependency changed and the unavailable package lane was not retried.

## Next authorized step

ROADMAP-0001 **STEP-15 / v0.0.15 — Background-Tab, Freeze/Discard/Reload and Restart Recovery Hardening**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. The CRSniffer Side Panel interaction grammar is an enforced team standard, not optional design inspiration.
