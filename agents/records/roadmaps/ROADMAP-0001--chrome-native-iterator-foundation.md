---
schema_version: 1
record_id: ROADMAP-0001
record_type: roadmap
slug: chrome-native-iterator-foundation
title: "ChatGPT Iterator Chrome-Native Foundation and Product Program"
status: active
revision: 4
created_at: 2026-08-23T18:34:00Z
updated_at: 2026-08-23T18:51:00Z
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [entrypoints/, src/, tests/, docs/, agents/records/, dumps/donors/]
relations:
  related: [ADR-0001, CONSTRAINT-0001, REFERENCE-0001, REFERENCE-0002, REFERENCE-0003, AUDIT-0001]
  depends_on: [ADR-0001, CONSTRAINT-0001]
  blocks: []
  supersedes: []
  superseded_by: []
provenance:
  created_from:
    type: iteration
    id: v0.0.1
planning:
  first_iteration: v0.0.1
  last_iteration: v0.0.16
  phase_count: 4
  step_count: 16
tags: [roadmap, chrome-extension, mv3, wxt, vue, side-panel, chatgpt, indexeddb, queue]
---
# ROADMAP-0001 — ChatGPT Iterator Chrome-Native Foundation and Product Program

## Executive summary

Convert the verified Tampermonkey ChatGPT iteration loop into a Chrome-native, Side-Panel-first application without merely moving the page-local polling loop into a content script. The program separates durable orchestration, tab lifecycle, persistence, presentation and volatile ChatGPT DOM integration; preserves the working iteration semantics/selectors behind a dedicated adapter; adds explicit tab targeting, profiles/presets, reusable templates, ordered message queues, settings/diagnostics and versioned import/export; and enforces the CRSniffer Side Panel interaction system as the team UI standard.

The planned range is `v0.0.1` through `v0.0.16`, one bounded roadmap step per version. STEP-01 is a bounded platform-contract / architecture-spike research iteration. STEP-02 onward is implementation. Before `v0.1.0`, ordinary work uses the established fast-path discipline: focused checks, no ritual broad proof loops, one final portable ZIP, and environment-only constraints as non-blocking `deferred_environment`.

## Problem statement

The existing userscript works but its orchestration, timers and DOM observation run in the ChatGPT renderer. Background-tab throttling, freezing/discarding and reload therefore affect progress directly. The current single injected panel also has no durable application model for multiple target tabs, reusable presets/templates, queue execution, persistent run recovery, diagnostics or data portability.

A literal userscript-to-content-script port would preserve too much of that coupling. Coordinated multi-step work is required to establish the extension authority boundaries first and then build product features without letting UI or DOM selectors become accidental runtime authority.

## Goals

- Ship a Manifest V3 Chrome 132+ extension with a global Side Panel primary UI.
- Use WXT + Vue 3 + TypeScript and the CRSniffer team-standard Side Panel interaction grammar.
- Keep ChatGPT DOM volatility inside one observable/diagnosable adapter.
- Bind execution to explicit ChatGPT `tabId` targets independent of the user's currently active tab.
- Persist authoritative run/queue/template/preset state in extension-origin IndexedDB.
- Recover correctly across Side Panel closure, service-worker termination and target reload where possible.
- Preserve repeat-mode behavior and add first-class ordered Queue mode.
- Add reusable Templates and Presets with stable IDs and explicit working-copy lifecycle.
- Add settings, selector/adapter diagnostics, run history and versioned import/export.
- Treat frozen/discarded target state truthfully instead of claiming Chrome can always execute hidden-page DOM work.

## Non-goals

- Automating arbitrary websites in ROADMAP-0001.
- Bypassing Chrome tab freezing, device sleep, renderer suspension or browser security boundaries.
- Using `chrome.debugger`/CDP to keep pages alive or automate ChatGPT.
- Direct OpenAI/ChatGPT private API automation, account/session extraction or credential handling.
- Arbitrary user JavaScript/eval/plugins in templates or queues.
- Workflow branching/conditions/general DAG automation in the initial queue model.
- Cloud synchronization of full run history or message content.
- Making Bootstrap 5 a competing baseline design system when the team-standard UI already covers the need.
- Pixel-identical imitation of Chrome private WebUI/theme internals.

## Fixed decisions and constraints

- `ADR-0001` is the runtime/persistence denominator. Material contradiction requires explicit ADR and roadmap revision.
- `CONSTRAINT-0001` makes CRSniffer Side Panel UI/layout/interaction reuse mandatory where applicable.
- Chrome 132+ is the initial supported browser baseline.
- WXT + Vue 3 + TypeScript is the application stack.
- Side Panel is the primary UI. The toolbar action opens/toggles it directly.
- Top-level workspaces are exactly: **Run · Queue · Presets · Templates · Settings** unless a roadmap revision changes information architecture.
- IndexedDB owns application collections; small Chrome storage tiers remain purpose-specific.
- Content scripts do not own durable application storage.
- ChatGPT selectors are centralized. Application/domain code may not query ChatGPT DOM directly.
- Run target is explicit `tabId`; active-tab changes never silently retarget execution.
- Import/export format version is independent from physical IndexedDB schema version.
- Environment-only verification is `deferred_environment`, never a false pass or roadmap-only blocker.

## Traceability model

Each step maps one product version to one coherent owner. Implementation steps add focused tests at the layer they change. UI-bearing steps include explicit `CONSTRAINT-0001` compliance checks. Browser/package checks that require unavailable Chrome/package infrastructure are recorded as `deferred_environment`; static/type/unit checks continue. Phase checkpoints may add accumulated regression appropriate to risk, but ordinary iterations do not create closure ceremony by default.

## Delivery governance

Use one mutable worktree from the accepted current version. The originally requested `chatgpt-iterator-v0.0.0` remains preferred provenance input if it becomes available, but explicit user authorization at v0.0.2 establishes the accepted v0.0.1 overlay as the forward implementation root. Implement only the current authorized step. Fresh external research is required only when current Chrome/WXT behavior materially controls that step. Donor/reference material is read-only. Every ordinary completed iteration produces one final portable ZIP; no wheels, checksum sidecars, candidate ZIPs, snapshot JSON, release-summary or cold-recovery loops are required unless the owning step explicitly concerns packaging/release integrity.

The v0.0.1 artifact was created as a planning overlay because the exact requested starter bytes were unavailable. At v0.0.2 the user explicitly authorized continuation to the next version, so the overlay becomes the accepted mutable implementation root for forward progress. This does not fabricate or claim byte-for-byte ancestry from the missing v0.0.0 archive; exact v0.0.0 source reconciliation remains a provenance deferral if those bytes surface later and must not silently overwrite accepted v0.0.2+ work.

## Phase register

| Phase | Steps | Objective | Entry dependency | Completion evidence |
| --- | --- | --- | --- | --- |
| P1 | STEP-01–STEP-05 | Architecture, extension shell, ChatGPT adapter and tab authority | accepted v0.0.1 overlay + verified userscript; original v0.0.0 provenance deferred | accepted contract + buildable shell + adapter + target-tab lifecycle |
| P2 | STEP-06–STEP-08 | Durable persistence and execution engines | P1 complete | IndexedDB + recoverable run state + Repeat execution |
| P3 | STEP-09–STEP-13 | Team-standard Side Panel product surfaces | P2 complete | five-tab product UI + Templates + Presets + Queue + Settings/diagnostics |
| P4 | STEP-14–STEP-16 | Portability, lifecycle hardening and closure | P3 complete | import/export + browser-lifecycle recovery + integrated closure |

# Phase P1 — Architecture, Extension Shell, Adapter and Tab Authority

## Phase objective

Establish the browser/platform contract and the smallest correct cross-context architecture before durable user data or feature-rich UI depends on it.

## Entry criteria

- [x] Working userscript selector/behavior reference exists.
- [x] CRSniffer UI/layout reference exists and is designated team standard.
- [x] Accepted v0.0.1 overlay is authorized as the mutable implementation root; exact `chatgpt-iterator-v0.0.0` byte reconciliation remains deferred provenance.

## Steps

### STEP-01 — Platform Contract, Team UI Authority, and Roadmap Freeze

**Target:** `v0.0.1`  
**Purpose:** Resolve only the browser/runtime uncertainties that could force an architectural rewrite; freeze the team UI authority and exact implementation-step ownership.  
**Depends on:** verified userscript + CRSniffer reference; exact starter source is not required for research-only records.  
**Related records:** `ADR-0001`, `CONSTRAINT-0001`, `REFERENCE-0001`, `REFERENCE-0002`, `AUDIT-0001`.  
**Primary packages/paths:** `agents/records/`, `dumps/donors/`.  
**Recommended workflow:** bounded research-first fast path; no production/runtime/test source change.

#### Work items

- [x] Refresh current first-party Side Panel, service-worker, Tabs, storage/IndexedDB, messaging and alarms authority.
- [x] Confirm Chrome 132+ baseline and frozen/discarded/auto-discardable semantics.
- [x] Freeze Side Panel → service worker/application → persistence → ChatGPT adapter authority boundaries.
- [x] Freeze short-delay scheduling strategy and explicit limitations of `chrome.alarms`.
- [x] Freeze CRSniffer interaction/layout grammar as mandatory team UI authority.
- [x] Freeze five workspaces: Run, Queue, Presets, Templates, Settings.
- [x] Freeze centralized selector/adapter and event-driven observation direction.
- [x] Freeze IndexedDB + purpose-specific Chrome storage tiering and versioned import/export direction.
- [x] Produce exact STEP-02–STEP-16 ownership.

#### Step acceptance evidence

- [x] `ADR-0001`, `CONSTRAINT-0001`, both references and research data agree on authority boundaries.
- [x] No unresolved platform question blocks STEP-02 foundation work.
- [x] No production/runtime/test code is changed in the research-only planning artifact.
- [x] Missing exact starter bytes are explicitly recorded rather than silently replaced.

### STEP-02 — MV3 WXT Vue Foundation and Team-Standard Side Panel Shell

**Target:** `v0.0.2`  
**Purpose:** Build the smallest usable Manifest V3 WXT + Vue 3 + TypeScript extension shell with global Side Panel, background entrypoint and team-standard UI primitives.  
**Depends on:** STEP-01; exact v0.0.0 byte reconciliation is deferred provenance after explicit user authorization to continue from the accepted overlay.  
**Primary packages/paths:** `package.json`, `wxt.config.ts`, `entrypoints/background.ts`, `entrypoints/sidepanel/`, `src/ui/`.  
**Recommended workflow:** fast-path scaffold/build-config iteration.

#### Work items

- [x] Reconcile starter dependencies with current WXT/Vue/TypeScript pins rather than blindly copying donor pins.
- [x] Configure MV3, Chrome 132 minimum and `sidePanel`/minimal permission floor.
- [x] Make toolbar action toggle/open the global Side Panel.
- [x] Establish team-standard shell/header/status/tabs primitives and icon component.
- [x] Establish five workspace destinations without implementing later domain behavior.
- [x] Keep all UI copy localization-ready from the first shell.

#### Step acceptance evidence

- [x] Focused STEP-02 static/source contract passes 6/6; package hydration/WXT prepare/typecheck/build are `deferred_environment` after the single npm hydration attempt timed out without creating a lockfile or node_modules.
- [x] Static manifest/source checks prove no broad host/debugger/unrelated permission expansion.
- [x] UI shell follows `CONSTRAINT-0001` with no recorded deviation: accessible roving workspace tabs, status/live lane, card grammar, responsive icon-only compression, native-aware system colors, focus, reduced-motion and forced-color handling are present.

**STEP-02 result (`v0.0.2`):** Added the first executable extension scaffold with exact refreshed WXT/Vue/TypeScript pins, Chrome 132+ MV3 authority, only the `sidePanel` permission, toolbar-action Side Panel opening, localized five-workspace Vue shell (`Run · Queue · Presets · Templates · Settings`), team-standard icon/status/card/navigation primitives and focused source contracts. No ChatGPT content script, host permission, persistence, messaging protocol, run engine or later-domain behavior is pulled forward. `REFERENCE-0003` records current package authority and the hydration deferral.

### STEP-03 — Versioned Cross-Context Contracts and Control Plane

**Target:** `v0.0.3`  
**Purpose:** Define stable JSON-safe request/response/event envelopes and reconstructable Side Panel ↔ service worker ↔ content-script messaging before domain features depend on ad hoc messages.  
**Depends on:** STEP-02.  
**Primary packages/paths:** `src/core/`, `src/control-plane/`, `src/runtime/`, tests.

#### Work items

- [x] Stable IDs, protocol/schema versions and normalized error categories.
- [x] One-shot command/query messages and bounded invalidation/event notifications.
- [x] Panel hydration/reconnect that never makes panel-local state canonical.
- [x] Request freshness/out-of-order protection.

#### Step acceptance evidence

- [x] Focused STEP-03 contract/control-plane tests pass 8/8 and the dependency-free `src/core` + `src/control-plane` TypeScript lane passes under available TypeScript 5.8.3.
- [x] Panel closure/reopen reconstructs test state from application authority; stale out-of-order hydration is ignored and Port reconnect carries hints only.

**STEP-03 result (`v0.0.3`):** Added strict JSON-safe versioned request/response envelopes with UUID-v4 message/request identity, runtime source/target context, query/command intent, normalized error categories/codes, correlation and schema/protocol rejection. Added a background-owned `ControlPlaneAuthority`, bounded `panel.hydrate` server, ephemeral Port invalidation hub, and Side Panel client with latest-request freshness, response correlation, reconnect scheduling and rehydration. The Vue shell now reflects control-plane connection/revision state without becoming canonical. No ChatGPT content script/selector, host/scripting permission, persistence, run engine or later-domain behavior is introduced. The previously deferred WXT/package-hydration lane remains `deferred_environment`; STEP-03's dependency-free TypeScript and Node contract lanes execute locally.

### STEP-04 — ChatGPT Adapter, Selector Registry, Observation and Diagnostics Contract

**Target:** `v0.0.4`  
**Purpose:** Move all volatile ChatGPT DOM knowledge behind one thin content-script adapter using the verified userscript behavior as reference.  
**Depends on:** STEP-03.  
**Primary packages/paths:** `entrypoints/*content*`, `src/chatgpt/`, tests.

#### Work items

- [x] Centralize composer, send, stop, continue and assistant-message selectors/fallbacks.
- [x] Expose semantic adapter operations/events rather than raw DOM nodes/selectors.
- [x] Replace short-interval observation loops with `MutationObserver`/event-driven state observation where possible.
- [x] Preserve draft-safety, response-start, response-stability and continue semantics from the userscript.
- [x] Add required/conditional selector health and adapter diagnostics.
- [x] Remove any need for remotely hosted `chatgpt.js` runtime code.

#### Step acceptance evidence

- [x] Fixture/DOM-adapter tests cover ready/busy/send/response/continue/error states.
- [x] No selector lookup exists outside `src/chatgpt/` adapter boundary.

**STEP-04 result (`v0.0.4`):** Added a host-scoped WXT content entrypoint and a product-owned `src/chatgpt/` boundary containing the verified userscript selector registry, semantic readiness/busy/draft/assistant/alert snapshots, safe send/Continue/stop/scroll commands, selector-health diagnostics, and a versioned content-side envelope server. Send preserves the empty-draft guard and captures the assistant baseline before mutation. DOM observation and send-button readiness are MutationObserver/event-driven rather than short-interval polling. A pure `ResponseCompletionTracker` preserves the userscript response-start timeout, Continue, response-activity and 3.5s stable-completion semantics while leaving actual scheduling to later runtime steps. Focused adapter/fixture validation passes 9/9, strict dependency-free core+chatgpt TypeScript passes, and source inspection confirms no ChatGPT selector lookup outside `src/chatgpt/`. No tab registry/lifecycle, persistence, durable execution engine or later UI scope is introduced. WXT package hydration/build remains inherited `deferred_environment`.

### STEP-05 — ChatGPT Tab Registry, Explicit Targeting and Browser Lifecycle

**Target:** `v0.0.5`  
**Purpose:** Make ChatGPT tabs first-class targets whose lifecycle is separate from the user's currently active browser tab.  
**Depends on:** STEP-04.  
**Primary packages/paths:** `src/tabs/`, `src/runtime/`, control-plane tests.

#### Work items

- [ ] Discover/load eligible ChatGPT tabs and capability/readiness state.
- [ ] Bind operations to explicit `tabId`/window identity.
- [ ] Observe update/remove/replace/frozen/discarded state.
- [ ] Implement reversible active-run `autoDiscardable` guard ownership.
- [ ] Define reconnect behavior after target reload and clear behavior after target close.

#### Step acceptance evidence

- [ ] Switching active browser tabs never changes an existing target binding.
- [ ] frozen/discarded/closed states produce explicit normalized state rather than hanging.

## Phase P1 success criteria

- [ ] Buildable MV3/Side Panel shell exists.
- [ ] Messaging/control plane is versioned and reconstructable.
- [ ] ChatGPT DOM volatility is isolated behind one tested adapter.
- [ ] Explicit target-tab lifecycle is observable and independent from active-tab navigation.
- [ ] UI-bearing work complies with `CONSTRAINT-0001`.

# Phase P2 — Durable Persistence and Execution Engines

## Phase objective

Make authoritative user definitions and runs survive panel/worker churn before feature-rich management UI is added.

## Steps

### STEP-06 — IndexedDB v1, Repositories, Storage Tiers and Migration Authority

**Target:** `v0.0.6`  
**Purpose:** Establish durable application data and migration boundaries before significant user state accumulates.  
**Depends on:** P1 complete.  
**Primary packages/paths:** `src/persistence/`, tests.

#### Work items

- [ ] Physical IndexedDB schema for metadata, templates, presets, queues, queue items, runs and run events/history.
- [ ] Stable repository/domain representations; storage internals do not leak upward.
- [ ] `chrome.storage.local/session/sync` adapters with explicit purpose and namespace.
- [ ] Separate physical DB version from logical model/export format versions.
- [ ] Transactional queue/item and import mutation boundaries.

#### Step acceptance evidence

- [ ] Focused repository/migration/transaction tests pass.
- [ ] Worker and extension-page storage ownership is explicit; content script has no application DB access.

### STEP-07 — Durable Run State Machine, Recovery and Command Semantics

**Target:** `v0.0.7`  
**Purpose:** Define authoritative run lifecycle independent of Repeat/Queue message sourcing.  
**Depends on:** STEP-06.  
**Primary packages/paths:** `src/runs/`, `src/runtime/`, tests.

#### Work items

- [ ] Run states including ready/running/waiting-response/waiting-delay/paused/frozen/discarded/completed/failed/stopped.
- [ ] Run IDs/generation fences so stale async completions cannot affect newer runs.
- [ ] Persist authoritative transition before externally observable continuation where required.
- [ ] Pause/resume/stop/reconcile semantics across worker wake/restart.
- [ ] Structured bounded run events/history.

#### Step acceptance evidence

- [ ] Focused transition/idempotency/recovery tests pass.
- [ ] Closing Side Panel does not own or terminate a run.

### STEP-08 — Repeat Mode, Message Sources and Short-Delay Scheduler

**Target:** `v0.0.8`  
**Purpose:** Reproduce the working userscript's repeat-loop behavior through the durable run engine.  
**Depends on:** STEP-07.  
**Primary packages/paths:** `src/runs/`, `src/messages/`, scheduler tests.

#### Work items

- [ ] `MessageSource` abstraction with Repeat as first implementation.
- [ ] Template placeholders at least `{iteration}`, `{total}`, `{remaining}`, `{timestamp}`.
- [ ] wait-idle → send → wait-response-start → wait-completion → delay → next sequence.
- [ ] Preserve no-send-into-existing-draft and response-baseline safety.
- [ ] Persist `nextDueAt`; use short worker timer for 5–29s and coarse alarm/reconcile strategy for longer/recovery paths.
- [ ] Automatic Continue support using adapter capability.

#### Step acceptance evidence

- [ ] Focused end-to-end engine tests cover nominal repeat, pause/resume/stop, timeout and stale-run cancellation.
- [ ] No 400ms service-worker/page polling loop is introduced as scheduler authority.

## Phase P2 success criteria

- [ ] Durable state survives service-worker restart in repository-controlled tests.
- [ ] Repeat mode preserves the known userscript safety semantics.
- [ ] Run correctness is independent from Side Panel liveness.

# Phase P3 — Team-Standard Side Panel Product Surfaces

## Phase objective

Expose the durable runtime through the five agreed workspaces without turning UI working copies into canonical execution state.

## Steps

### STEP-09 — Run Workspace and Five-Tab Product Shell

**Target:** `v0.0.9`  
**Purpose:** Deliver the normal operational entry point and full top-level information architecture.  
**Depends on:** P2 complete.  
**Primary packages/paths:** `entrypoints/sidepanel/`, `src/ui/`, control-plane.

#### Work items

- [ ] Run / Queue / Presets / Templates / Settings tabs using team-standard tab semantics.
- [ ] Run target picker/load current ChatGPT tabs.
- [ ] Preset selector without requiring a saved preset to run.
- [ ] Repeat form, iterations/delay/auto-continue controls and Start/Pause/Resume/Stop.
- [ ] Live run state/progress and frozen/discarded/reconnect explanations.
- [ ] 320px/narrow reflow, keyboard/focus/status lane and reduced-motion compliance.

#### Step acceptance evidence

- [ ] Focused Run UI/control-plane tests pass.
- [ ] `CONSTRAINT-0001` compliance is explicit; no competing layout grammar is introduced.

### STEP-10 — Templates Workspace and Variable Contract

**Target:** `v0.0.10`  
**Purpose:** Deliver reusable message content with stable IDs and bounded variables.  
**Depends on:** STEP-09.  
**Primary packages/paths:** `src/templates/`, Side Panel Templates workspace, tests.

#### Work items

- [ ] New/load working copy/Save As/Update/Reset/Duplicate/Delete lifecycle.
- [ ] Stable IDs independent of names.
- [ ] Bounded variables and preview/validation; no scripting/eval.
- [ ] Stale revision/dirty working-copy protection.

#### Step acceptance evidence

- [ ] Domain/repository/UI lifecycle tests pass.
- [ ] Team-standard reusable-definition grammar is reused.

### STEP-11 — Presets Workspace and Run Configuration Hydration

**Target:** `v0.0.11`  
**Purpose:** Save reusable complete run configurations without making presets mandatory ceremony.  
**Depends on:** STEP-10.  
**Primary packages/paths:** `src/presets/`, Side Panel Presets workspace, tests.

#### Work items

- [ ] Preset references template or queue IDs plus mode/iterations/delay/auto-continue/tab-behavior defaults.
- [ ] Loading a preset hydrates a disposable run working copy; it never mutates an active run silently.
- [ ] Same reusable-definition lifecycle and stale/dirty protection as Templates.

#### Step acceptance evidence

- [ ] Preset/template reference integrity and hydration tests pass.
- [ ] Run without preset remains supported.

### STEP-12 — Queue Workspace and Queue Execution Mode

**Target:** `v0.0.12`  
**Purpose:** Add ordered message queueing as a sibling execution mode to Repeat.  
**Depends on:** STEP-11.  
**Primary packages/paths:** `src/queues/`, Side Panel Queue workspace, run/message-source integration.

#### Work items

- [ ] Ordered queue + queue items with stable IDs and transactional saves.
- [ ] Item can use literal message or reusable Template reference.
- [ ] Enable/disable item and optional per-item `delayAfter` override.
- [ ] Team-standard explicit Move Up/Move Down/Remove controls; drag may be added later only as enhancement, never sole ordering method.
- [ ] `QueueMessageSource` plugs into the same run engine as Repeat.

#### Step acceptance evidence

- [ ] Queue transaction/order/reference tests pass.
- [ ] Same run lifecycle handles Repeat and Queue without mode-specific duplicate orchestration.

### STEP-13 — Settings, Diagnostics, History and Data Management Surface

**Target:** `v0.0.13`  
**Purpose:** Centralize extension-wide preferences, adapter health, lifecycle diagnostics and bounded history management.  
**Depends on:** STEP-12.  
**Primary packages/paths:** `src/settings/`, `src/diagnostics/`, Side Panel Settings workspace.

#### Work items

- [ ] Defaults for preset/delay/auto-continue/recovery/tab guard behavior.
- [ ] Selector/adapter diagnostics distinguishing required vs conditional capabilities.
- [ ] Tab/runtime/database/schema/migration/storage diagnostics without exposing private payloads by default.
- [ ] Run history browse/clear policy with bounded retention.
- [ ] Appearance follows system/native-aware team standard; no private Chrome theme scraping.

#### Step acceptance evidence

- [ ] Settings validation/persistence and diagnostics projection tests pass.
- [ ] Settings UI follows team-standard surface/action/state grammar.

## Phase P3 success criteria

- [ ] All five top-level workspaces are functional.
- [ ] Templates, Presets and Queues share consistent reusable-object semantics.
- [ ] Run remains the primary operational path and does not require setup ceremony.
- [ ] Normal user paths do not require raw IDs/schema/JSON.

# Phase P4 — Portability, Lifecycle Hardening and Closure

## Phase objective

Make durable user state portable and prove the product behaves truthfully across browser/runtime lifecycle boundaries.

## Steps

### STEP-14 — Versioned Export, Import, Merge/Replace and Backup Semantics

**Target:** `v0.0.14`  
**Purpose:** Add portable configuration/full-backup workflows independent from internal IndexedDB layout.  
**Depends on:** P3 complete.  
**Primary packages/paths:** `src/portability/`, Settings/Data UI, persistence tests.

#### Work items

- [ ] Versioned export envelope with product/format version and exported-at metadata.
- [ ] Default configuration export: Templates + Presets + Queues + Settings; Run history opt-in/full-backup only.
- [ ] Import validation + preview counts/conflicts before mutation.
- [ ] Merge, replace imported records and full replace semantics with transactional application.
- [ ] Preserve stable IDs/references and migrate supported older export formats through explicit import adapters.

#### Step acceptance evidence

- [ ] Round-trip, conflict, rollback and cross-version fixture tests pass.
- [ ] Failed import cannot leave partial durable state.

### STEP-15 — Background-Tab, Freeze/Discard/Reload and Restart Recovery Hardening

**Target:** `v0.0.15`  
**Purpose:** Exercise and harden every browser lifecycle boundary the conversion was intended to improve.  
**Depends on:** STEP-14.  
**Primary packages/paths:** runtime/tab/adapter/run integration tests and browser harness where available.

#### Work items

- [ ] Inactive-tab execution without active-tab dependency.
- [ ] frozen target detection/recovery messaging and no false progress claim.
- [ ] discarded/reloaded target reconnection and adapter re-handshake.
- [ ] service-worker restart during waiting-response/waiting-delay.
- [ ] Side Panel close/reopen during active run.
- [ ] browser restart policy for unfinished runs: recover as explicit suspended/reconcilable state rather than silently duplicate sends.
- [ ] restore target `autoDiscardable` ownership after every terminal path.

#### Step acceptance evidence

- [ ] Repository-controlled lifecycle simulations pass.
- [ ] Real packaged Chrome lanes run where available; environment-only unavailable lanes are `deferred_environment` rather than blockers or passes.

### STEP-16 — Integrated Product/UI Standard/Accessibility/Package Closure

**Target:** `v0.0.16`  
**Purpose:** Close ROADMAP-0001 only after integrated normal-user stories, team UI compliance, portability and package/install behavior match the implemented product.  
**Depends on:** STEP-01 through STEP-15.  
**Primary packages/paths:** whole repository.

#### Work items

- [ ] First-use story: open Side Panel → select ChatGPT tab → configure Repeat → run → pause/resume/stop.
- [ ] Preset/template story including working-copy save/update/reset/duplicate/delete.
- [ ] Queue create/reorder/run story.
- [ ] Export/import recovery story.
- [ ] Inactive-tab/service-worker/panel-reconnect/frozen/discarded stories.
- [ ] Keyboard/focus/target-size/narrow-reflow/reduced-motion/forced-colors/localization checks.
- [ ] Team-standard CRSniffer pattern matrix with every applicable primitive adopted or justified deviation recorded.
- [ ] Minimal-permission/CSP and no-remote-code package inspection.
- [ ] Package/build/install/upgrade smoke where environment permits.
- [ ] Reconcile user docs and roadmap/ADR/constraint state.

#### Step acceptance evidence

- [ ] Integrated tests appropriate to accumulated scope pass.
- [ ] No known blocking normal-user correctness defect remains.
- [ ] Environment-only unavailable packaged-browser/store lanes are explicitly `deferred_environment`.
- [ ] ROADMAP-0001 closes without automatically authorizing `v0.1.0` or a successor roadmap.

## Phase P4 success criteria

- [ ] Durable user definitions are portable and recoverable.
- [ ] Runtime survives/reconciles browser context churn without duplicate-send authority errors.
- [ ] Product UI conforms to team standard and accessibility/responsive contracts.
- [ ] Package/install authority matches the actual extension.

# Master step checklist

- [x] STEP-01 — Platform Contract, Team UI Authority, and Roadmap Freeze (`v0.0.1`) — research/records complete; exact starter merge deferred because baseline bytes unavailable.
- [x] STEP-02 — MV3 WXT Vue Foundation and Team-Standard Side Panel Shell (`v0.0.2`) — executable shell/static contracts complete; package hydration/build lane deferred_environment.
- [x] STEP-03 — Versioned Cross-Context Contracts and Control Plane (`v0.0.3`) — strict envelopes, background authority, bounded hydration/invalidation, reconnect and stale-response protection complete.
- [x] STEP-04 — ChatGPT Adapter, Selector Registry, Observation and Diagnostics Contract (`v0.0.4`) — centralized selectors, semantic content adapter/server, MutationObserver state stream, response tracker and diagnostics complete.
- [ ] STEP-05 — ChatGPT Tab Registry, Explicit Targeting and Browser Lifecycle (`v0.0.5`).
- [ ] STEP-06 — IndexedDB v1, Repositories, Storage Tiers and Migration Authority (`v0.0.6`).
- [ ] STEP-07 — Durable Run State Machine, Recovery and Command Semantics (`v0.0.7`).
- [ ] STEP-08 — Repeat Mode, Message Sources and Short-Delay Scheduler (`v0.0.8`).
- [ ] STEP-09 — Run Workspace and Five-Tab Product Shell (`v0.0.9`).
- [ ] STEP-10 — Templates Workspace and Variable Contract (`v0.0.10`).
- [ ] STEP-11 — Presets Workspace and Run Configuration Hydration (`v0.0.11`).
- [ ] STEP-12 — Queue Workspace and Queue Execution Mode (`v0.0.12`).
- [ ] STEP-13 — Settings, Diagnostics, History and Data Management Surface (`v0.0.13`).
- [ ] STEP-14 — Versioned Export, Import, Merge/Replace and Backup Semantics (`v0.0.14`).
- [ ] STEP-15 — Background-Tab, Freeze/Discard/Reload and Restart Recovery Hardening (`v0.0.15`).
- [ ] STEP-16 — Integrated Product/UI Standard/Accessibility/Package Closure (`v0.0.16`).

## Roadmap change control

Material changes to scope, ordering, identity, information architecture, team-standard UI authority or success criteria require an explicit roadmap revision and, when architectural, an ADR. Completed history is never rewritten as though the earlier plan did not exist.

## Closure criteria

- [ ] All 16 required steps complete.
- [ ] All four phase success criteria complete.
- [ ] Applicable CRSniffer team-standard UI patterns are reused; every deviation is justified.
- [ ] Required IndexedDB/import-export migrations are tested against representative state.
- [ ] Run/Queue execution authority survives tested panel/worker/tab lifecycle changes without duplicate sends.
- [ ] Packaging contains no remotely hosted executable code and declares only required Chrome permissions.
- [ ] Required records/docs are reconciled.
- [ ] Any environment-only unavailable verification is explicit and does not masquerade as pass.


## Revision history

| Date | Revision | Change | Status |
| --- | ---: | --- | --- |
| 2026-08-24 | 1 | Open ROADMAP-0001 and complete STEP-01 platform contract. | historical |
| 2026-08-24 | 2 | Accept explicit continuation from the v0.0.1 overlay, complete STEP-02 executable WXT/Vue Side Panel shell, and carry exact v0.0.0 byte reconciliation plus package hydration as explicit provenance/environment deferrals. | historical |
| 2026-08-24 | 3 | Complete STEP-03 versioned JSON-safe cross-context contracts, background-owned control-plane hydration/invalidation and Side Panel freshness/reconnect semantics; v0.0.4 STEP-04 next. | historical |
| 2026-08-24 | 4 | Complete STEP-04 product-owned ChatGPT selector/adapter/observation/diagnostics boundary with userscript semantics and no remote runtime code; v0.0.5 STEP-05 next. | active |
