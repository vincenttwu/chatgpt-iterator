---
schema_version: 1
record_id: ADR-0001
record_type: adr
slug: event-driven-runtime-and-persistence-boundaries
title: "Event-Driven Runtime and Persistence Boundaries"
status: accepted
revision: 7
created_at: 2026-08-23T18:34:00Z
updated_at: 2026-08-24T14:08:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [entrypoints/, src/runtime/, src/chatgpt/, src/persistence/, src/tabs/, src/runs/, src/presentation/]
relations:
  related: [ROADMAP-0001, ROADMAP-0002, CONSTRAINT-0001, MATRIX-0002, REFERENCE-0001, REFERENCE-0002, REFERENCE-0006]
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


## ROADMAP-0002 STEP-02 caller and privacy boundary

At `v0.0.18`, cross-context authorization is tightened without changing the four authority zones:

- background request authorization derives the caller class from Chrome `MessageSender` metadata and the extension's own runtime ID;
- Side Panel authority requires an own-extension Side Panel document; top-frame ChatGPT content authority requires an own-extension content sender, `frameId === 0`, an eligible ChatGPT origin/URL, and its actual `sender.tab` identity;
- the message envelope `source` remains versioned correlation metadata and must agree with the verified caller, but it is no longer sufficient authorization by itself;
- current content-origin background authority is restricted to adapter-state publication for the sender's own tab; the future mini-controller policy is intentionally limited to Pause/Resume/Stop semantics and is not enabled as a command surface in STEP-02;
- ChatGPT adapter schema v2 exposes `composerHasDraft` and an opaque deterministic `assistantFingerprint`; raw composer text remains content-local and assistant text is not serialized into background snapshots/observations;
- run state schema v2 stores `assistantBaselineFingerprint`; logical persistence advances to v2 with an explicit v1->v2 run migration while physical IndexedDB remains v1 and portable format v1 remains readable through compatibility normalization.

These changes strengthen the existing background/application and content-adapter boundary; they do not authorize a popup, second execution engine, conversation binding, or new host permission.

## ROADMAP-0002 STEP-03 tab-plus-conversation execution authority

At `v0.0.19`, explicit tab targeting is strengthened into **tab-plus-conversation** authority without creating a second runtime or persistence owner:

- the ChatGPT adapter derives a semantic conversation context from the current eligible ChatGPT URL/location: `/` is `new_chat`, `/c/<id>` is a concrete conversation, and unrelated/unsupported routes fail closed;
- the tab registry projects that semantic adapter context, but sidebar titles/active-item DOM are never canonical identity;
- durable run state schema v3 stores an independent conversation binding in addition to `(tabId, windowId)`;
- a run that starts on `/` may move from `pending_new_chat` to the first concrete `/c/<id>` exactly once; after a concrete binding exists, later same-tab conversation/new-chat/unsupported changes are mismatches;
- mismatch is a generation-fenced durable `conversation_changed` suspension. Resume is blocked until an explicit Side Panel rebind verifies the selected ready tab and its current conversation;
- browser-session-reset rebind continues to be explicit and, when a prior concrete conversation is known, must re-establish that conversation authority rather than merely accepting the recycled/new tab ID;
- an ambiguous `waiting_response` mismatch may not be rebound to another conversation because the preceding send may already have occurred; returning to the original conversation is required before continuing;
- the shared Repeat/Queue coordinator reconciles this same binding around execution and response observation; Queue does not gain separate conversation semantics;
- `chatgpt.send` carries the expected conversation context to the content adapter, which verifies it immediately before the native send click. This closes the SPA navigation race between background preparation and page-side side effect;
- legacy run schemas without reliable conversation provenance normalize to an `unbound` v3 binding rather than fabricating identity.

This is a logical authority evolution only: global logical model and run state advance to v3, ChatGPT adapter snapshots advance to v3, and tab-registry snapshots advance to v2. Physical IndexedDB remains v1 and portable envelope format remains v1.


## ROADMAP-0002 STEP-04 timing and presentation authority

At `v0.0.20`, runtime timing truth and presentation vocabulary are hardened without changing execution ownership:

- active `waiting_delay` state owns an absolute persisted `nextDueAt`; a paused run whose resume state is `waiting_delay` instead owns a bounded persisted `remainingDelayMs` and no active absolute due time;
- Pause freezes that remaining duration, scheduler cancellation removes volatile wake authority, and Resume creates a fresh due time from the frozen remainder. Wall-clock time spent paused therefore cannot consume the user's requested inter-iteration delay;
- same-session worker recovery preserves paused remainder without scheduling it. Browser-session/conversation transitions that pause a waiting delay apply the same frozen-remainder invariant rather than leaving stale due authority;
- durable run schema/logical persistence advance to v4 for timing fields and explicit v3 compatibility normalization. Physical IndexedDB remains v1 and portable envelope format remains v1;
- response waits persist `responseStartedAt` so presentation may report elapsed wait duration. No runtime or UI may fabricate a response completion ETA;
- `src/presentation/run-projection.ts` is the pure shared state projection for all presentation surfaces. The Side Panel consumes it first; later toolbar and in-page surfaces must reuse it rather than re-derive lifecycle/progress/timing semantics;
- semantic presentation tones are centralized, but textual lifecycle labels, attention explanations and action availability remain authoritative so state is never communicated only by color;
- the Side Panel's local display clock exists only to redraw countdown/elapsed text. It is not scheduler, response-observation or durable execution authority.

This preserves the four original authority zones and the single Repeat/Queue coordinator. Toolbar status and the in-page controller remain separately owned by later roadmap steps.

## ROADMAP-0002 STEP-08 drift and terminal-retention boundary

At `v0.0.24`, production-facing ChatGPT drift handling and retained-content policy are hardened without moving any of the four authority zones:

- ChatGPT selector knowledge is explicitly classified as **structural anchors**, **transient capabilities**, or **diagnostic signals**. Structural readiness is not inferred from the incidental presence of a Send/Stop/Continue/Voice control.
- The visible exact `#prompt-textarea[contenteditable="true"]` composer is the only composer eligible for send authority. The hidden fallback textarea may support drift diagnosis but must never become a send target. Structural preflight runs before composer write and again before the native send click; existing expected-conversation point-of-click verification remains mandatory.
- Adapter schema v4 publishes machine-readable degradation reasons so unsupported route, missing/ambiguous composer, capability absence, conversation mismatch, rate-limit/page alerts and adapter drift can be distinguished rather than collapsed into generic unavailability.
- DOM observation remains `MutationObserver`/event-driven. Busy assistant-fingerprint-only streaming updates may be coalesced behind one-shot bounded timers; this pacing is not an authority loop and must never be replaced by fixed-interval polling. Semantic state/completion transitions remain immediate.
- Terminal execution content is compacted at the authoritative terminal transition. Repeat message templates and resolved Queue-item content are removed/replaced by an explicit compacted sentinel, and transient active-message/response/delay fields are cleared. Active/recovery runs retain exactly the message content needed to preserve recovery correctness until terminal transition.
- Durable run state and global logical persistence advance to v5, with explicit v1/v2/v3/v4 normalization and a logical `4 -> 5` migration that compacts accepted old terminal state while preserving active state. Unknown schemas fail explicitly.
- Physical IndexedDB remains v1 and portable envelope remains v1. Current full backups contain compact current terminal runs; accepted legacy embedded run states normalize through compatibility adapters on read. Full backups remain sensitive because configuration definitions, metadata and event payloads remain part of that product surface.
- Diagnostics, History, toolbar projection and in-page controller projection remain prompt/assistant-text minimal. Layout-advisor selectors remain presentation-only and never become send authority.

This decision strengthens drift/privacy/retention behavior inside the existing adapter, runtime and persistence zones. It does not authorize another execution engine, additional permissions/hosts, a conventional toolbar popup, or content-script ownership of durable state.

## ROADMAP-0002 closure disposition

At `v0.0.25`, this ADR remains **accepted** and the original four authority zones remain intact. ROADMAP-0002 hardens the boundaries rather than replacing them:

- verified Chrome sender context classifies Side Panel and top-frame ChatGPT content callers;
- durable execution authority is tab + conversation + generation aware;
- the shared Repeat/Queue coordinator performs final conversation-safe send checks and remains the only workflow execution engine;
- paused delays persist a frozen remainder while active delays persist an absolute deadline;
- Side Panel, toolbar and the in-page mini controller consume one `RunPresentationProjection` rather than owning competing lifecycle state;
- the mini controller is a closed-Shadow-DOM secondary projection with bounded same-tab controls and no durable datastore/configuration ownership;
- ChatGPT DOM observation remains event-driven with bounded stream coalescing, not a 400ms polling engine;
- logical/run state v5 compacts terminal message content while physical IndexedDB v1 and portable envelope v1 remain independent authorities.

MATRIX-0002 verifies the integrated successor boundary. No closure finding requires a superseding ADR.
