---
schema_version: 1
record_id: MATRIX-0002
record_type: matrix
slug: successor-hardening-closure
title: "ROADMAP-0002 Successor Hardening Closure Matrix"
status: accepted
revision: 1
created_at: 2026-08-24T14:08:00+08:00
updated_at: 2026-08-24T14:08:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [src/, entrypoints/, tests/, agents/records/]
relations:
  related: [ROADMAP-0002, ADR-0001, CONSTRAINT-0001, AUDIT-0003, REFERENCE-0006, MATRIX-0001]
  depends_on: [ROADMAP-0002, ADR-0001, CONSTRAINT-0001]
  blocks: []
  supersedes: []
  superseded_by: []
provenance: {created_from: {type: iteration, id: "roadmap-0002-step-09.v0.0.25"}}
tags: [matrix, closure, hardening, privacy, security, recovery, accessibility]
---
# MATRIX-0002 — ROADMAP-0002 Successor Hardening Closure Matrix

Overall disposition: **ACCEPTED**.

This matrix reconciles the successor program as one product. It does not replace the detailed STEP-02 through STEP-08 evidence; it verifies that those contracts compose without creating a second execution authority, a competing primary UI, or a privacy/correctness regression.

| Concern | Closed contract | Integrated evidence | Disposition |
| --- | --- | --- | --- |
| Sender-derived caller trust | Chrome `MessageSender` determines Side Panel vs top-frame ChatGPT content authority; envelope `source` must agree but cannot grant authority | `src/runtime/caller-context.ts`, `message-router.ts`, STEP-02/STEP-09 tests | Accepted |
| Same-tab conversation safety | Run is tab + conversation bound; `/ -> /c/<id>` adopts once; later mismatch suspends; actual send rechecks conversation immediately before click | `src/runs/conversation.ts`, manager/coordinator, adapter send guard, STEP-03/STEP-09 tests | Accepted, fail-closed |
| Pause/resume timing truth | Active delay owns absolute `nextDueAt`; paused delay owns frozen `remainingDelayMs`; Resume creates a fresh due time | run v5 model/manager, shared projection, STEP-04/STEP-09 tests | Accepted |
| One presentation vocabulary | Side Panel, toolbar title/badge and mini controller consume `RunPresentationProjection` | `src/presentation/run-projection.ts`, toolbar/in-page projectors | Accepted |
| Toolbar hierarchy | Action click still opens Side Panel; toolbar adds badge/title only; no `default_popup` | WXT/background + STEP-05/STEP-09 static checks | Accepted |
| Mini controller authority | Closed Shadow DOM secondary surface; receives privacy-safe projection; can only Pause/Resume/Stop plus presentation commands; no durable DB/config authority | in-page presentation/runtime + STEP-06/STEP-09 tests | Accepted |
| Controller placement/a11y | Six canonical docks; trusted drag snaps to docks; non-drag buttons + keyboard + reset; collision-safe; reduced motion/forced colors/44px controls | placement/layout/DOM modules + STEP-07/STEP-09 tests | Accepted |
| Adapter drift | Structural composer/assistant anchors are separated from transient Send/Stop/Continue/Voice capabilities and diagnostic hints | selector registry + adapter v4 + STEP-08 tests | Accepted |
| Observation volume | ChatGPT observation remains MutationObserver/event-driven; stream-only fingerprint changes are coalesced; no content execution polling loop | adapter/content/coordinator static + STEP-08/STEP-09 tests | Accepted |
| Default adapter privacy | Raw composer draft stays content-local; assistant text is represented by opaque fingerprint rather than suffix text | adapter v4 compatibility/runtime tests | Accepted |
| Terminal durable privacy | Terminal Repeat template / Queue resolved content compacted; transient execution fields cleared; active/recovery content retained until terminal | run/logical v5, migration 4→5, STEP-08 tests | Accepted |
| History/diagnostics/secondary projection privacy | Public History, diagnostics, toolbar and mini-controller projections do not expose prompt/assistant bodies | focused privacy tests + STEP-09 inspection | Accepted |
| Portability compatibility | Portable envelope remains v1; legacy embedded run states normalize; configuration export excludes run history | portability compatibility + STEP-08 tests | Accepted |
| Storage separation | Physical IndexedDB remains v1 while logical/run model is v5 | persistence versions/migrations + closure checks | Accepted |
| Permission / host / CSP | Permissions exactly `sidePanel`, `storage`, `alarms`; ChatGPT hosts only; self-only extension CSP; no popup/remote eval authority | `wxt.config.ts`, content matches, STEP-09 static checks | Accepted |
| Side Panel team standard | Primary five-workspace Side Panel remains governed by CONSTRAINT-0001/MATRIX-0001; secondary surfaces do not replace it | Side Panel + MATRIX-0001 + STEP-09 closure | Accepted |
| Accumulated regression state | Retained historical assertions were reconciled only where later authorized contracts superseded exact fixture/version assumptions | reconciled pre-closure 203/203; final accumulated 214/214 | Accepted after clean final run |
| WXT/Vue/package/browser lane | One fresh npm hydration attempt timed out after 120s; no `node_modules` or lockfile was produced; Chromium is present but there is no hydrated WXT build to install | closure environment inspection | `DEFERRED_ENVIRONMENT`, non-blocking |

## Closure interpretation

ROADMAP-0002 is a hardening closure, not a semantic/public major/minor release declaration. Closure authorizes neither `v0.1.0`, `v0.0.26`, nor a successor roadmap. Side Panel remains primary; toolbar and in-page controller remain bounded projections over the same durable background authority.
