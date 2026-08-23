# ChatGPT Iterator — v0.0.13

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-13 is complete and **Phase P3 is closed**. All five top-level workspaces — **Run · Queue · Presets · Templates · Settings** — are now functional. Run remains the direct-first operational path; Settings supplies optional defaults and operational visibility without becoming setup ceremony.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.13

- Added revisioned, sync-backed Settings for an optional default Preset, direct-run delay, auto-continue, auto-scroll, prevent-discard, worker recovery policy and bounded history retention.
- Settings remain optional: applying defaults only hydrates the disposable Run draft and never mutates a nonterminal durable run. If a default Preset is unavailable, Run falls back safely to direct Repeat defaults.
- Added operational worker recovery policy: `resume` preserves normal recovery while `pause` generation-fences recovered nonterminal runs and leaves them paused for explicit user action.
- Added privacy-safe terminal Run History with bounded retention and clear-history support. Retention/clear operations never remove nonterminal runs and history excludes message bodies, composer drafts and assistant text.
- Added diagnostics that compose the existing ChatGPT adapter required/conditional capability health with tab binding/lifecycle, runtime counts, DB/logical/export versions, migration state, Chrome storage responsibilities and local data counts.
- Diagnostics expose structural health only; they do not surface private prompt/response payloads by default.
- Replaced the Settings placeholder with team-standard **Execution defaults · Runtime health · Run history · Local data inventory** cards using the established action/state/status grammar.
- Appearance remains system/native-aware through CSS system colors; no private Chrome theme APIs or `chrome://` styling are queried.
- The Data surface reports local inventory and storage responsibilities while explicitly reserving versioned export/import, preview, merge/replace and full-backup semantics for STEP-14.
- IndexedDB remains physical v1 and Chrome permissions remain `sidePanel`, `storage`, `alarms`.

## Validation

- `npm run test:step13`: **10/10 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check for Settings/Diagnostics/History/runtime/UI contracts: **PASS** with TypeScript 5.8.3.
- Single STEP-12 Queue predecessor smoke: **10/10 PASS**.
- Version/roadmap/schema/permission/localization/privacy-boundary consistency: **PASS**.
- WXT dependency hydration/prepare/full Vue typecheck/build remain inherited **DEFERRED_ENVIRONMENT**; no dependency changed and the unavailable package lane was not retried.

## Next authorized step

ROADMAP-0001 **STEP-14 / v0.0.14 — Versioned Export, Import, Merge/Replace and Backup Semantics**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. The CRSniffer Side Panel interaction grammar is an enforced team standard, not optional design inspiration.
