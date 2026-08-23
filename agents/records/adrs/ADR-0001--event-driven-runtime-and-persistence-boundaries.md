---
schema_version: 1
record_id: ADR-0001
record_type: adr
slug: event-driven-runtime-and-persistence-boundaries
title: "Event-Driven Runtime and Persistence Boundaries"
status: accepted
revision: 2
created_at: 2026-08-23T18:34:00Z
updated_at: 2026-08-24T04:48:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [entrypoints/, src/runtime/, src/chatgpt/, src/persistence/, src/tabs/]
relations:
  related: [ROADMAP-0001, CONSTRAINT-0001, REFERENCE-0001, REFERENCE-0002]
  depends_on: [REFERENCE-0001, CONSTRAINT-0001]
  blocks: []
  supersedes: []
  superseded_by: []
provenance: {created_from: {type: iteration, id: "v0.0.1"}}
tags: [adr, chrome, mv3, service-worker, indexeddb, messaging, tabs]
---
# ADR-0001 — Event-Driven Runtime and Persistence Boundaries

## Decision

ChatGPT Iterator will be a Chrome Manifest V3, Side-Panel-first extension with four explicit authority zones:

1. **Side Panel presentation** — Vue 3 + WXT UI; reconstructable view/working-copy state only.
2. **Extension runtime/application** — service-worker-owned orchestration, run/queue scheduling, tab registry and application commands.
3. **Extension persistence** — IndexedDB as durable application datastore; `chrome.storage.local/session/sync` only for appropriately small bootstrap/preferences/session coordination.
4. **ChatGPT adapter** — a thin content script owning volatile DOM selectors, composer interaction and DOM observation; it never owns durable application state.

Cross-context behavior uses explicit versionable request/response/event messages. Durable run correctness must not depend on the Side Panel remaining open or on service-worker global variables surviving termination.

## Runtime lifecycle

- Target baseline: Chrome 132+ so `Tab.frozen` is directly observable.
- A run binds explicitly to a target `tabId`; switching the user's active browser tab does not retarget the run.
- `autoDiscardable` may be temporarily set to `false` for an active run and restored afterward.
- `discarded` and `frozen` are distinct lifecycle states. A frozen target cannot run content-script/page tasks; Iterator must surface that truth rather than claim uninterrupted DOM execution.
- Service-worker state is persisted before/at authoritative transitions and reconstructed after wake/restart.

## Event model

The ChatGPT adapter should prefer `MutationObserver` and direct state-change events over short-interval DOM polling. It exposes semantic operations/events such as composer readiness, response started/changed/completed, continue available, send, and adapter health.

## Scheduling

The current product delay floor of 5 seconds is preserved. Packaged `chrome.alarms` cannot provide sub-30-second execution. Therefore:

- short delays use a service-worker timer while persisting `nextDueAt` first;
- `chrome.alarms` may provide coarse recovery/long-delay scheduling at supported intervals;
- every worker wake reconciles persisted due work and never assumes an in-memory timer survived;
- device sleep, frozen tabs and browser lifecycle may make an action late; correctness favors visible recovery over false precision.

## Persistence

IndexedDB is the primary datastore for presets, templates, queues, queue items, runs, run events/history and schema metadata. The service worker and extension pages share the extension origin database. Content scripts must not open application IndexedDB because web storage APIs there address the ChatGPT host origin.

## UI authority

CONSTRAINT-0001 is mandatory. Presentation may not replace runtime or persistence authority, and closing/reopening the Side Panel must reconstruct the current run instead of cancelling or restarting it.

## ROADMAP-0001 closure disposition

At v0.0.16 the decision remains **accepted**. The completed product preserves the four authority zones, explicit tab binding, event-driven adapter, IndexedDB/storage separation and persisted recovery fences. Browser-session reset now pauses and requires explicit target rebind because tab IDs are session-scoped; same-session worker restart may reconcile persisted work without blind resend. Repeat and Queue share one coordinator. Portability format v1 remains independent of physical IndexedDB v1. No closure change requires a superseding ADR.
