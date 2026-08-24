---
schema_version: 1
record_id: ROADMAP-0002
record_type: roadmap
slug: interaction-surface-and-runtime-hardening
title: "ChatGPT Iterator Interaction Surface and Runtime Hardening"
status: closed
revision: 9
created_at: 2026-08-24T11:26:00+08:00
updated_at: 2026-08-24T14:08:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [entrypoints/, src/, tests/, docs/, agents/records/, dumps/donors/]
relations:
  related: [ROADMAP-0001, ADR-0001, CONSTRAINT-0001, MATRIX-0001, MATRIX-0002, AUDIT-0002, AUDIT-0003, REFERENCE-0006]
  depends_on: [ROADMAP-0001, ADR-0001, CONSTRAINT-0001]
  blocks: []
  supersedes: []
  superseded_by: []
provenance:
  created_from:
    type: iteration
    id: roadmap-0002-step-01.v0.0.17
planning:
  first_iteration: v0.0.17
  last_iteration: v0.0.25
  phase_count: 3
  step_count: 9
tags: [roadmap, hardening, chatgpt, mv3, side-panel, in-page-controller, privacy, conversation-identity, recovery, accessibility]
---
# ROADMAP-0002 — ChatGPT Iterator Interaction Surface and Runtime Hardening

## Executive summary

ROADMAP-0001 closed the foundational/product program at `v0.0.16`: ChatGPT Iterator is already a durable Chrome MV3 application with a Side-Panel-first Run/Queue/Presets/Templates/Settings product, explicit target-tab authority, a centralized ChatGPT DOM adapter, versioned cross-context contracts, IndexedDB-backed run/configuration state, generation/idempotency fencing, Repeat and Queue execution through one coordinator, lifecycle recovery, diagnostics/history, and portable configuration/full-backup semantics.

The successor program deliberately does **not** expand the workflow vocabulary. The highest-value remaining work is at product/runtime boundaries:

1. prevent a run from silently following the same tab into the wrong ChatGPT conversation;
2. minimize user/assistant text retained or transported by runtime authority;
3. authenticate cross-context caller authority from the actual Chrome sender context rather than trusting only a self-declared message `source` field;
4. make pause/delay semantics truthful and expose one shared runtime presentation projection;
5. restore the original Tampermonkey script's high-value **in-page minimal controller** as a secondary operational surface while preserving the Side Panel as the primary product surface;
6. expose concise toolbar status without replacing toolbar-click → Side Panel behavior;
7. harden selector/capability drift, SPA navigation, observation volume and terminal data retention; and
8. close the successor only after cross-surface security/privacy/recovery/accessibility evidence is reconciled.

This roadmap uses `v0.0.17` as a planning/evidence-freeze iteration. Product hardening then proceeds one bounded implementation step per version from `v0.0.18` through `v0.0.25`. No `v0.1.0` promotion is implied.

## Why a successor is justified

`v0.0.16` is architecturally mature but still not fully field-proven. The foundation already solves the expensive structural problems—durable authority, explicit tab targeting, conservative no-blind-resend recovery, run generation fencing, one Repeat/Queue coordinator, lifecycle-aware scheduling and a disciplined Side Panel. Adding more workflow types now would increase product breadth without addressing the most consequential correctness and usability gaps.

The remaining risks are boundary risks:

- **wrong-conversation risk:** a run is bound to `(tabId, windowId)`, but ChatGPT is a single-page application and the user can navigate from conversation A to conversation B inside the same tab;
- **privacy surface:** the adapter snapshot currently transports raw composer draft text, the assistant signature embeds a suffix of assistant text, and durable run execution state can retain prompt-bearing fields after terminal completion;
- **caller-trust surface:** multiple background runtime servers validate `request.source === 'sidepanel'` or `content`, but the envelope source is self-declared data and should be corroborated/derived from Chrome `MessageSender` when commands cross the extension boundary;
- **timing truth:** pausing a run in `waiting_delay` cancels scheduling but preserves the original absolute `nextDueAt`, so a long pause can consume the delay and Resume may continue immediately rather than freezing remaining delay like the original userscript;
- **status visibility:** when the Side Panel is closed, the user loses most operational visibility even though a durable run may continue;
- **DOM/capability drift:** the current ChatGPT composer remains structurally recognizable, but send/stop/voice controls are transient capabilities rather than stable structural anchors;
- **field evidence:** repository-controlled tests are strong, while package hydration and real packaged-Chrome/real-ChatGPT verification remain environment constrained.

These issues have high value because they protect correctness and trust without multiplying product concepts.

# Accepted baseline and handoff snapshot

## Promoted baseline entering ROADMAP-0002

- **Accepted version:** `v0.0.16`.
- **ROADMAP-0001:** closed, 16/16 steps complete.
- **Current product stack:** Chrome MV3, Chrome 132+ baseline, WXT 0.21.4, Vue 3.5.41, TypeScript 7.0.2 package pin, Node >=22.
- **Available local compiler in prior closure environment:** TypeScript 5.8.3 for dependency-free strict checks.
- **Top-level Side Panel workspaces:** exactly **Run · Queue · Presets · Templates · Settings**.
- **Current Chrome permissions:** `sidePanel`, `storage`, `alarms` only.
- **Content host scope:** `https://chatgpt.com/*` and `https://chat.openai.com/*` only.
- **Physical IndexedDB version:** v1.
- **Portable format:** v1.
- **Durable run state schema:** v1 at roadmap opening.
- **ChatGPT adapter schema:** v1 at roadmap opening.
- **No remote executable runtime, no eval/arbitrary scripting, no debugger/CDP, no broad host scope.**

## Repository-controlled closure evidence inherited from v0.0.16

- STEP-16 focused closure: 9/9 pass.
- Accumulated STEP-02–STEP-16 tests: 133/133 pass.
- Strict dependency-free TypeScript: pass across 96 source files.
- CRSniffer/team-standard UI matrix: reconciled.
- Localization catalog: 298/298 keys and values aligned.
- Minimal permissions/CSP/no-remote-code inspection: pass.
- WXT hydration/full Vue build/package and real packaged-Chrome install/upgrade: `deferred_environment` because npm hydration timed out and no generated extension bundle existed.

ROADMAP-0002 inherits those facts as baseline evidence; it does not rewrite them as fresh passes.

## Existing architecture that MUST be preserved

### Presentation and authority

- The **Side Panel remains the primary product UI**.
- The Side Panel is reconstructable presentation/query/command state, never durable execution authority.
- Background/application services own durable orchestration and privileged mutations.
- IndexedDB owns durable application collections.
- Browser-session coordination may use `chrome.storage.session`; small preferences use purpose-specific Chrome storage tiers.
- Content scripts remain volatile ChatGPT DOM adapters and do not own durable application storage.

### Run execution

- A run currently binds to explicit `(targetTabId, targetWindowId)`.
- Active browser tab changes do not silently retarget execution.
- Repeat and Queue share one `RepeatRunCoordinator`/message-source orchestration path rather than separate engines.
- Every accepted run mutation advances generation and writes durable state/event authority before publication.
- Exact command replay uses durable command identity/idempotency.
- Stale async work must lose against the durable generation fence.
- Browser-session reset does not silently auto-resume; unfinished work pauses and requires explicit rebind.
- Frozen/discarded/reconnecting targets are explicit lifecycle states, not hidden success.

### ChatGPT adapter

All volatile DOM knowledge remains under `src/chatgpt/`. Product/domain layers must not query ChatGPT DOM directly.

Current adapter operations include semantic snapshot/diagnostics/send/Continue/stop/scroll. Response observation is event-driven through DOM mutation observation and bounded deadline timers; no 400ms service-worker/page polling loop may return as runtime authority.

### Product data

- Templates, Presets and Queues have stable IDs/revisions and explicit working-copy lifecycle.
- Queue execution freezes resolved enabled items into the durable run snapshot so later Queue/Template edits do not reinterpret active work.
- History is a redacted terminal-run projection.
- Configuration export excludes history by default; full backup is explicitly sensitive.
- Import is preview-before-apply and preserves active/nonterminal run authority.

# Evidence frozen at ROADMAP-0002 opening

This section is intentionally duplicated here so the roadmap can serve as a semi-handoff without requiring reconstruction of the planning conversation.

## Current-code audit findings from v0.0.16

### 1. Tab identity exists; conversation identity does not

`DurableRunSnapshot` stores `targetTabId` and `targetWindowId`. Run create/rebind/manager reconciliation operate at the tab/window level. There is no durable `conversationId`/conversation-context field in the run model at roadmap opening.

Implication: the extension can protect against the wrong **tab** while still following a same-tab ChatGPT SPA navigation into the wrong **conversation**.

### 2. Adapter/runtime transports more text than necessary

At roadmap opening:

- `ChatGptAdapterSnapshot.composerDraft` is a raw string;
- adapter snapshots construct `assistantSignature` from message count, latest text length and the last 240 characters of assistant text;
- `RunExecutionCommon.activeMessage` can store the prepared outbound message;
- Repeat run state retains `messageTemplate`;
- Queue run state retains resolved item `content`;
- terminal history is redacted, but the underlying durable run object can retain prompt-bearing execution data.

Implication: correctness does not require all of this text to remain broadly transported/retained forever.

### 3. Runtime envelope source is validated but not yet sender-derived

Runtime servers commonly reject unless `request.source === 'sidepanel'` (or `content` for adapter state). This is useful protocol validation, but a future secondary in-page control surface increases the value of deriving/corroborating caller identity from Chrome `MessageSender` (`sender.tab`, frame/document/origin/extension identity) at the actual message boundary.

### 4. Pause does not freeze remaining delay

When a run enters `waiting_delay`, `execution.nextDueAt` is absolute. `pause()` preserves execution state. Therefore time can continue to elapse while paused. The original userscript's interruptible delay decremented only while unpaused.

Implication: ROADMAP-0002 should restore the intuitive/userscript-compatible semantic: pausing during inter-iteration delay freezes remaining delay, then Resume continues the remainder.

### 5. Toolbar click is already intentionally owned by Side Panel

`entrypoints/background.ts` calls `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`. This is a deliberate product behavior and should remain. A conventional toolbar popup would compete with that interaction and is therefore **not** the preferred successor surface.

## User-provided current ChatGPT HTML evidence (2026-08-24)

A current user-provided ChatGPT page HTML capture was inspected during roadmap planning. Material observations:

- the visible composer is still `#prompt-textarea` with `contenteditable="true"`, `role="textbox"`, `aria-multiline="true"`, and accessible label `Chat with ChatGPT`;
- a hidden fallback `<textarea name="prompt-textarea">` is also present, so adapter lookup should explicitly prefer the visible contenteditable composer and must not accidentally target the hidden fallback;
- assistant turns still expose `data-message-author-role="assistant"` in the current capture;
- conversation navigation uses current route shape `/c/<conversation-id>` and the active conversation item can be marked `data-active`; route/location should be primary identity evidence while sidebar active state is diagnostic corroboration only;
- the capture contains no `data-testid="send-button"` or `data-testid="stop-button"` in its idle empty-composer state; the trailing control at that moment is **Start Voice**, confirming that send/stop are transient capabilities rather than permanent structural anchors;
- ChatGPT's composer is a sticky bottom surface (`#thread-bottom-container` / composer body), so a floating in-page controller must avoid hard-coded bottom-right overlap;
- the original Tampermonkey controller is not visible in the pasted `<body>` fragment because the userscript appended its host to `document.documentElement` and rendered the UI in Shadow DOM. Its absence from body serialization is therefore not evidence that the old interaction shape failed.

## Original userscript interaction evidence retained as product inspiration

The verified donor userscript already proved a useful lightweight interaction shape:

- fixed in-page control surface;
- Shadow DOM isolation;
- persisted collapsed state;
- small launcher;
- Start / Pause-Resume / Stop controls;
- visible phase and `sent/total` progress;
- delay that truly pauses while the run is paused.

ROADMAP-0002 adopts the **interaction shape**, not the userscript's page-local authority model. Durable run truth continues to live in extension authority.

## Current first-party platform facts refreshed for planning

Chrome for Developers currently documents:

- `runtime.MessageSender` exposes sender context such as extension ID, tab, frame, document, URL and origin where applicable;
- `chrome.action` supports concise badge text, per-tab state, dynamic accessible titles/tooltips, and optional popup documents;
- Chrome recommends badge text remain very short (roughly four characters or fewer);
- defining an action popup changes action-click behavior, while the current product deliberately uses the action click to toggle/open the Side Panel;
- `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` remains supported;
- `sidePanel.open()` is user-interaction constrained.

W3C WCAG 2.2 SC 2.5.7 requires functionality implemented through dragging to have a non-drag single-pointer alternative unless dragging is essential. Therefore optional controller dragging cannot be the only placement method.

See `REFERENCE-0006` for frozen source URLs and accepted disposition.

# Product stance for ROADMAP-0002

## Side Panel remains primary; mini controller is secondary

ROADMAP-0002 does **not** replace the Side Panel with a conventional toolbar popup.

The desired hierarchy is:

1. **Side Panel — full product surface**
   - target selection/rebind;
   - direct Repeat/Queue configuration;
   - Templates/Presets/Queues;
   - Settings/Diagnostics/History/Data;
   - complete durable-run cards and explanations.

2. **In-page mini controller — quick operational projection**
   - run state/progress/countdown;
   - Pause/Resume/Stop;
   - Open Side Panel;
   - optionally start one explicitly configured default Preset when idle, if safety preconditions are satisfied;
   - no full message/template editor, history browser, import/export or durable-definition mutation.

3. **Toolbar action — at-a-glance indicator and Side Panel launcher**
   - badge/title status only;
   - toolbar click continues to open/toggle Side Panel;
   - no competing default popup.

All three surfaces consume the same application-owned run projection. None owns execution truth independently.

# Goals

- Bind an active run to the intended ChatGPT conversation context, not only the browser tab.
- Fail closed on same-tab conversation changes and require explicit user rebind before further send authority.
- Reduce raw user/assistant text transported outside the content adapter when only boolean/fingerprint semantics are needed.
- Compact terminal run authority so prompt-bearing fields are not retained indefinitely merely for history display.
- Derive/corroborate external caller authority from actual Chrome sender context.
- Make pause/resume timing semantics freeze and restore the exact remaining inter-iteration delay.
- Introduce one reusable `RunPresentationProjection` consumed by Side Panel, toolbar badge/title and mini controller.
- Provide a compact in-page Shadow DOM run controller that recovers the original userscript's convenience without recreating page-local orchestration.
- Keep optional dragging accessible through deterministic dock/snap controls and collision-safe placement.
- Improve ChatGPT capability drift detection, selector preflight, SPA/navigation classification and observation coalescing.
- Preserve the one Repeat/Queue execution engine, minimal permissions, self-only CSP and bounded portability model.

# Non-goals

- A conventional `action.default_popup` as the new primary or competing product UI.
- Replacing or shrinking the existing Side Panel feature set.
- New workflow modes, DAG/branching automation, conditions, arbitrary scripting/plugins or macros.
- New arbitrary websites beyond the existing ChatGPT host scope.
- `chrome.debugger`, CDP, private ChatGPT/OpenAI APIs, credential/session extraction or bypassing ChatGPT/browser controls.
- Storing raw conversation content for analytics/telemetry.
- Remote telemetry/upload or cloud synchronization of run history/message content.
- Using color alone to communicate run state.
- Drag-only placement or drag-only product actions.
- Reintroducing fixed-interval 400ms runtime polling.
- Claiming packaged-Chrome/real-ChatGPT verification when package/tooling/browser access is unavailable.
- Automatic semantic/public promotion to `v0.1.0` at roadmap closure.

# Fixed decisions and constraints

1. `ADR-0001` remains the runtime/persistence denominator unless explicitly superseded by a later ADR.
2. `CONSTRAINT-0001` remains the mandatory CRSniffer team Side Panel interaction standard where applicable.
3. Side Panel is primary. In-page controller and toolbar indicator are **secondary projections**.
4. Content script/page UI never becomes canonical durable authority.
5. ChatGPT DOM selectors remain centralized under `src/chatgpt/`.
6. Run mutation generation/idempotency fencing remains mandatory across every new command path.
7. Conversation mismatch must fail closed before any external send/Continue side effect.
8. The in-page controller may operate only the run associated with its own verified ChatGPT tab/conversation context; it may not arbitrarily choose another tab.
9. Toolbar action click remains Side Panel opening/toggling; no default popup is introduced by this roadmap.
10. UI state must never depend on color alone; text/icon/accessible labels accompany state tones.
11. Dragging is optional enhancement only and must have dock/snap/reset single-pointer alternatives.
12. Physical IndexedDB v1 remains the preferred topology. Logical run/adapter/portable schemas may evolve independently when required.
13. Existing portable v1 inputs remain readable through explicit adapters when a new output schema/format is introduced; unknown older formats remain rejected rather than guessed.
14. No permission is added merely for convenience. Any permission change requires an explicit step-level justification and static test.
15. Environment/toolchain/auth/browser constraints are `deferred_environment` and never block authorized implementation progress.
16. The roadmap is allowed to be intentionally spacious, but each implementation version must still own one coherent hardening boundary.

# Proposed successor contracts

These are design targets, not final TypeScript declarations. The owning step may refine field names while preserving semantics.

## Conversation context

A ChatGPT conversation context should be representable independently from tab identity:

```text
ChatGptConversationContext
  kind: 'new' | 'conversation' | 'other'
  conversationId: string | null
  pathname: string
  observedAt: string
```

Accepted lifecycle concept:

```text
run starts on /                  -> pending conversation binding
first / -> /c/<id> transition    -> bind exactly once
/c/A remains /c/A                -> continue
/c/A -> /c/B                     -> suspend: conversation_changed
conversation_changed             -> no send authority
explicit user rebind + resume    -> continue on chosen context
```

The active sidebar item may help diagnostics, but URL/location context is the primary product identity because sidebar structure can collapse, virtualize or change.

## Privacy-minimal adapter snapshot

The adapter should expose semantic facts rather than unnecessary raw content. Target direction:

```text
composerPresent: boolean
composerHasDraft: boolean
assistantFingerprint: opaque stable fingerprint
assistantMessageCount: number
busy/sendAvailable/continueAvailable/stopAvailable
conversationContext
pageAlert / selector health
```

Raw composer text should remain content-local unless a command explicitly requires text to be written. Assistant fingerprint implementation must avoid embedding assistant text in the serialized value.

## Durable execution minimization

Active execution may retain enough material to recover safely, but terminal completion should support compaction:

- clear `activeMessage`, assistant baseline and transient timing fields;
- replace prompt-bearing Queue resolved content with stable structural metadata/digests where terminal history no longer requires the content;
- determine whether Repeat template text must remain on terminal runs or can be compacted to a digest/reference snapshot;
- preserve sufficient portability/audit information to explain mode, counts, timing and outcome without retaining full prompt bodies by default.

No compaction may weaken active-run restart recovery or duplicate-send safety.

## RunPresentationProjection

One application-owned read model should drive every presentation surface:

```text
RunPresentationProjection
  runId
  target tab/conversation summary
  lifecycle state
  semantic tone: idle | active | waiting | paused | attention | success | error
  completed / total
  current iteration
  phase label
  countdownSeconds: number | null
  elapsedResponseSeconds: number | null
  resumable / pausable / stoppable / rebindRequired
  attention reason
```

Rules:

- `waiting_delay`: exact countdown derived from durable remaining-delay authority;
- `waiting_response`: elapsed/indeterminate activity, **never a fabricated completion ETA**;
- paused/frozen/discarded/reconnecting/conversation-changed states remain explicit;
- Side Panel, toolbar and mini controller must not independently reinvent lifecycle-to-label/color mapping.

## Mini controller boundary

The controller is a content-script-created Shadow DOM host on ChatGPT pages. It may display only presentation-safe run information and narrow commands.

Allowed examples:

- state/progress/countdown;
- Pause/Resume/Stop current local run;
- Open Side Panel;
- optional default-Preset quick start if explicitly enabled and current tab/conversation safety checks pass.

Forbidden examples:

- direct IndexedDB access;
- durable definition mutation;
- arbitrary target-tab selection;
- raw history browser;
- full import/export;
- independent timers/orchestration;
- direct DOM send logic bypassing the centralized ChatGPT adapter/application coordinator.

# Risk register

| Risk | Why it matters | Required mitigation |
| --- | --- | --- |
| Same-tab conversation switch | Can send automation into the wrong conversation despite correct tab binding | STEP-03 durable conversation context + fail-closed suspension/rebind |
| New-chat route transition | `/` becomes `/c/<id>` after first send | One-time pending→bound transition with explicit invariants and tests |
| Raw prompt/assistant text transport | Expands privacy and diagnostic/storage exposure | STEP-02 semantic draft boolean + opaque fingerprint + sender-bound APIs |
| Terminal prompt retention | History does not require all execution content indefinitely | STEP-08 compaction with portability compatibility |
| Self-declared message source | Secondary content UI increases cross-context command surface | STEP-02 Chrome `MessageSender`-derived/corroborated caller authority |
| Pause delay drift | Resume may skip remaining user-requested delay | STEP-04 persist/freeze remaining delay |
| Multiple presentation surfaces diverge | Side Panel/badge/mini UI can disagree on state | STEP-04 single projection |
| Floating controller overlaps composer | ChatGPT composer is sticky and responsive | STEP-06/07 collision-safe dock policy and canonical positions |
| Drag-only controller placement | Accessibility failure | STEP-07 dock/snap/reset controls independent of drag |
| ChatGPT button selector churn | Send/Stop may appear only conditionally | STEP-08 structural anchors + capability discovery/degradation |
| Streaming observation volume | Full snapshot fingerprint changes can flood background | STEP-08 semantic coalescing and bounded invalidations |
| Build/browser environment unavailable | Could create false release confidence | Explicit `deferred_environment`; repository-controlled proof still executes |

# Phase register

| Phase | Steps | Objective | Entry dependency | Completion evidence |
| --- | --- | --- | --- | --- |
| **P1 — Safety Authority** | STEP-01–STEP-03 | Freeze successor authority; minimize caller/content exposure; add conversation identity | closed v0.0.16 baseline | planning audit + sender/privacy contract + wrong-conversation prevention |
| **P2 — Runtime Visibility and Secondary Control** | STEP-04–STEP-07 | truthful timing/projection, toolbar indicator, minimal in-page controller, docking/accessibility | P1 complete | shared projection + cross-surface state parity + accessible collision-safe controller |
| **P3 — Drift/Retention and Closure** | STEP-08–STEP-09 | production-facing ChatGPT drift/observation/data-retention hardening and integrated closure | P2 complete | adapter/retention hardening + integrated security/privacy/recovery/a11y/package evidence |

# Detailed step program

## STEP-01 — Successor Hardening Evaluation, Evidence Freeze, and Roadmap Opening

**Target:** `v0.0.17`  
**Status:** complete in this planning iteration.  
**Purpose:** Convert the post-v0.0.16 evaluation into governed successor authority without mixing planning and product implementation.  
**Depends on:** ROADMAP-0001 closed at v0.0.16.  
**Primary paths:** `agents/records/roadmaps/`, `agents/records/audits/`, `agents/records/references/`, README/version metadata.

### Work items

- [x] Audit v0.0.16 product/runtime boundaries against the requested mini-control/status/hardening direction.
- [x] Inspect current code for tab-vs-conversation identity, prompt-bearing runtime state, envelope source checks, pause/delay behavior and toolbar Side Panel authority.
- [x] Incorporate the user-provided current ChatGPT HTML evidence into the successor design.
- [x] Refresh current Chrome action/Side Panel/MessageSender authority and WCAG dragging requirements that materially control the plan.
- [x] Decide secondary in-page controller over conventional toolbar popup.
- [x] Freeze Side Panel-primary / background-authority / content-adapter boundaries.
- [x] Define phased implementation ownership through v0.0.25.
- [x] Preserve ROADMAP-0001 as immutable closed historical authority.

### Acceptance

- [x] ROADMAP-0002 is detailed enough to resume from a new session without reconstructing the planning conversation.
- [x] Every identified high-value gap has a bounded owner or is explicitly rejected/non-goal.
- [x] No product/runtime/test behavior is changed by the planning step.
- [x] Next authorized implementation is exactly `v0.0.18 / STEP-02`.

### Explicitly out of scope

- Implementing any sender/privacy/conversation/UI hardening in v0.0.17.
- Consuming the first implementation version during planning.

---

## STEP-02 — Runtime Caller Authority and Privacy-Minimal Adapter Contract

**Target:** `v0.0.18`  
**Purpose:** Harden the trust/privacy boundary before adding a new content-page command surface.  
**Depends on:** STEP-01.  
**Primary paths:** `src/core/`, `src/chatgpt/`, `src/runtime/`, `entrypoints/chatgpt.content.ts`, `entrypoints/background.ts`, portability/run schema adapters as required.

### Work items

- [x] Introduce an explicit background message-boundary caller context derived/corroborated from Chrome `MessageSender` rather than trusting only the JSON envelope `source`.
- [x] Distinguish trusted extension-page callers from top-frame ChatGPT content-script callers; reject unexpected frames/origins/extensions.
- [x] Preserve protocol envelope source as descriptive/correlation data, but make actual command authorization depend on verified sender context.
- [x] Create ChatGPT adapter schema v2 or equivalent compatible evolution where raw `composerDraft` is replaced by `composerHasDraft` for external snapshots.
- [x] Replace text-bearing assistant signature serialization with an opaque deterministic fingerprint suitable for response-baseline comparison.
- [x] Keep raw composer reads content-local for draft-safety checks; never return them merely for diagnostics/state projection.
- [x] Audit adapter diagnostics/observations for accidental prompt/assistant leakage.
- [x] Define the narrow command authorization that the future mini controller will be allowed to use; do **not** build the controller yet.
- [x] Add explicit adapters/migration logic for persisted run/portable state if the signature/schema shape changes.

### Acceptance

- [x] Focused sender-auth tests prove a forged `source: sidepanel` from a content-script sender cannot call Side Panel-only operations.
- [x] Top-frame ChatGPT content sender can invoke only explicitly allowed content-origin operations and only for its own `sender.tab` context.
- [x] No raw composer text appears in background adapter snapshots/diagnostics/observation payloads.
- [x] Assistant baseline comparison still detects response changes without embedding assistant text.
- [x] Repeat and Queue duplicate-send safety remains intact.
- [x] Existing v1 durable/portable state remains readable through explicit compatibility handling where affected.

### Explicitly out of scope

- Conversation identity enforcement (STEP-03).
- Toolbar badge or mini controller UI (STEP-05/06).
- Terminal-run content compaction beyond schema changes strictly required here (STEP-08).

---

## STEP-03 — Conversation Identity and Wrong-Conversation Send Prevention

**Target:** `v0.0.19`  
**Status:** complete.  
**Purpose:** Ensure a run cannot silently follow the same ChatGPT tab into a different conversation.  
**Depends on:** STEP-02.  
**Primary paths:** `src/chatgpt/`, `src/tabs/`, `src/runs/`, `src/runtime/`, Run workspace/rebind UI, tests.

### Work items

- [x] Add semantic ChatGPT `ConversationContext` extraction behind the adapter boundary.
- [x] Recognize at minimum current contexts: new chat `/`, conversation `/c/<id>`, and non-conversation/unsupported ChatGPT route.
- [x] Add durable run conversation binding independently from `(tabId, windowId)`.
- [x] Support exactly one safe **pending new-chat → concrete `/c/<id>`** adoption when the run starts before ChatGPT assigns an ID.
- [x] Detect `/c/A → /c/B`, conversation→new-chat, or supported→unsupported route changes while a run is nonterminal.
- [x] Add a durable suspension reason such as `conversation_changed`; invalidate in-flight async work through generation fencing before any further external command.
- [x] Require explicit user rebind from the Side Panel before Resume after conversation mismatch.
- [x] Rebind must verify selected tab **and** current conversation context before clearing suspension.
- [x] Do not use active sidebar item as canonical identity; it may appear only as diagnostic corroboration.
- [x] Ensure reload/reconnect of the same conversation remains recoverable without false mismatch.

### Acceptance

- [x] Same-tab `/c/A → /c/B` test proves no second send occurs and run suspends.
- [x] New-chat `/ → /c/A` first-binding test succeeds without false suspension.
- [x] A later `/c/A → /c/B` after first binding suspends and requires explicit rebind.
- [x] Reload/reconnect of `/c/A` keeps the same binding.
- [x] Browser-session reset still requires explicit tab rebind and now also establishes/validates conversation authority.
- [x] Queue and Repeat both inherit the same conversation guard through the shared coordinator.

### Explicitly out of scope

- Automatic following of user-selected new conversations.
- Title-based identity or sidebar DOM as primary authority.
- Cross-conversation workflows.

**P1 closes when STEP-03 is accepted.**

---

## STEP-04 — Timing Semantics and Unified Run Presentation Projection

**Target:** `v0.0.20`  
**Status:** complete.  
**Purpose:** Make pause/countdown semantics truthful and create one state projection for every future presentation surface.  
**Depends on:** P1 complete.  
**Primary paths:** `src/runs/`, `src/runtime/`, `src/ui/`, scheduler tests.

### Work items

- [x] Replace pause-during-delay behavior that preserves stale absolute `nextDueAt` with durable **remaining delay** semantics.
- [x] On Pause from `waiting_delay`, compute and persist bounded `remainingDelayMs` (or equivalent) and clear/cancel active due authority.
- [x] On Resume, create a fresh due time from the preserved remainder rather than from the original wall-clock due time.
- [x] Preserve scheduler/worker recovery behavior for paused delay state across service-worker termination.
- [x] Define one pure `RunPresentationProjection`/projector from durable run + current time + target/conversation state.
- [x] Include lifecycle label/tone, completed/total, current iteration, exact delay countdown, response elapsed time, rebind/attention flags and available actions.
- [x] Never fabricate a response completion ETA while ChatGPT is generating; waiting response is elapsed/indeterminate.
- [x] Refactor the Side Panel run card to consume the shared projection instead of locally remapping lifecycle state.
- [x] Centralize semantic state tones so later toolbar/controller surfaces cannot diverge.

### Acceptance

- [x] Pause 6 seconds into a 10-second delay, wait arbitrarily long, Resume → approximately 4 seconds remain.
- [x] Worker restart while paused does not consume or duplicate remaining delay.
- [x] Projection tests cover every lifecycle/suspension state and do not rely on color alone.
- [x] Side Panel behavior remains functionally equivalent except for corrected delay semantics and richer truthful state.

### Explicitly out of scope

- Toolbar badge rendering (STEP-05).
- In-page controller (STEP-06/07).

---

## STEP-05 — Toolbar Status and At-a-Glance Runtime Indicator

**Target:** `v0.0.21`  
**Status:** complete.  
**Purpose:** Preserve operational visibility when the Side Panel is closed without creating a competing toolbar popup.  
**Depends on:** STEP-04.  
**Primary paths:** `entrypoints/background.ts`, `src/presentation/` or equivalent shared projection adapter, action/status tests.

### Work items

- [x] Keep `openPanelOnActionClick: true` as the toolbar click behavior.
- [x] Do **not** add `action.default_popup`.
- [x] Drive toolbar badge text/title exclusively from the shared run projection.
- [x] Use concise badge values suitable for Chrome space constraints, e.g. `3/5`, `P`, `!`, or active-run count when multiple runs exist.
- [x] Use `action.setTitle()` for richer accessible status such as `Waiting 6s before iteration 4 of 5`.
- [x] Define deterministic multi-run aggregation: selected/active tab may use per-tab status; global state should not misleadingly show one run as the only run when several are active.
- [x] Clear/reset badge/title when no relevant run remains.
- [x] Avoid visually encoding state only through badge background color; text/title remain authoritative.

### Acceptance

- [x] Toolbar click still opens/toggles the Side Panel.
- [x] No popup entrypoint or new permission is introduced.
- [x] Badge/title update on start, delay countdown boundary changes, pause, attention/rebind, completion/failure and clear.
- [x] Multi-run status is deterministic and documented.
- [x] Worker restart reconstructs action state from durable authority rather than stale globals.


### Result

`v0.0.21` adds a background-owned toolbar status adapter over the STEP-04 `RunPresentationProjection`. A single nonterminal run projects concise progress/paused/attention badge text plus a richer localized title; multiple runs aggregate to a deterministic count globally and per target tab rather than selecting an arbitrary winner. Presentation-only second-boundary timers refresh countdown/elapsed titles while the worker is alive, but they never drive ChatGPT observation or run execution. Terminal completion/failure clears stale action state, worker restart rebuilds from durable runs, toolbar click continues to open the Side Panel, and no popup, permission, schema, host-scope, or badge-color-only contract was introduced.

---

## STEP-06 — Minimal In-Page Run Controller

**Target:** `v0.0.22`  
**Status:** complete.  
**Purpose:** Recover the original Tampermonkey script's high-value local controls without recreating page-local execution authority.  
**Depends on:** STEP-05.  
**Primary paths:** ChatGPT content entrypoint, new in-page presentation module, sender-authorized runtime operations, localization/tests.

### Work items

- [x] Create a content-script-owned host attached outside ChatGPT's application component tree where practical and render the controller in Shadow DOM for CSS isolation.
- [x] Default to a compact launcher/status pill; expand to a small operational card.
- [x] Show state, `completed/total`, current iteration and exact delay countdown/response activity from `RunPresentationProjection` only.
- [x] Expose narrow **Pause / Resume / Stop / Open Side Panel** controls for the run associated with this verified local ChatGPT tab/conversation.
- [x] Optionally support **Start default Preset** only if explicitly enabled in Settings and current target/conversation preconditions pass; no arbitrary target picker in the mini surface.
- [x] Do not display raw prompt text/history by default.
- [x] Do not provide Templates/Presets/Queue editing, Data import/export, diagnostics management or full Settings.
- [x] Commands must route through background application authority and generation fencing; the mini controller may not click ChatGPT send/stop directly except through existing authorized adapter pathways.
- [x] Controller close/collapse state is a small preference, not durable run authority.
- [x] Ensure the controller never becomes required for execution correctness; removing/reloading it must not stop or corrupt an active run.

### Acceptance

- [x] Side Panel and mini controller show the same lifecycle/progress for the same run.
- [x] Forged/foreign content contexts cannot operate another tab's run.
- [x] Closing/reloading the page controller does not terminate background run authority.
- [x] Pause/Resume/Stop from the mini controller exercise the same manager/coordinator paths as Side Panel commands.
- [x] No new execution loop, polling loop or durable content storage is introduced.
- [x] Keyboard/focus/status semantics work in both collapsed and expanded modes.

### Explicitly out of scope

- Freeform dragging/placement persistence (STEP-07).
- Full configuration editor in page.


### Result

`v0.0.22` restores the original userscript's high-value local interaction as a **secondary, content-script-rendered mini controller** without restoring page-local execution authority. The controller host is attached directly under `document.documentElement`, outside ChatGPT's application component tree, and uses a **closed Shadow DOM** for CSS/DOM isolation. It defaults to a compact status launcher and expands to a small operational card showing the same `RunPresentationProjection` lifecycle, progress, current iteration, exact delay countdown or response-elapsed state used by the Side Panel and toolbar. It displays no prompt/history body content.

The content surface can issue only `inpage.status`, `inpage.pause`, `inpage.resume`, `inpage.stop`, `inpage.openpanel`, and `inpage.setcollapsed`. Background routing still derives caller identity from Chrome `MessageSender`; in-page run commands are same-tab/window bounded and generation fenced. Resume additionally reconciles the current conversation and refuses wrong-conversation continuation. Pause/Resume/Stop share the same `executeRunControl()` manager/coordinator path now used by Side Panel run commands. Multiple nonterminal runs targeting the same tab fail closed to a read-only count and require the Side Panel rather than selecting an arbitrary run.

Run mutations send lightweight invalidation hints to ChatGPT tabs, while countdown/response seconds advance locally from the safe projection using presentation-only second-boundary `setTimeout` calculations. No ChatGPT polling, scheduler, IndexedDB ownership, or execution loop is introduced in content. Collapse preference is stored by background in the existing trusted local Chrome-storage tier; content cannot access extension storage directly. Button actions require trusted user events, Escape collapses the expanded card, one atomic polite status region announces state, and controls retain 44px-class minimum height. `sidePanel.open({tabId})` is used only from the user-initiated Open Side Panel action; toolbar-click -> Side Panel remains unchanged.

The roadmap-bounded optional **Start default Preset** action is not exposed because current Settings contains no explicit mini-controller quick-start opt-in. Freeform dragging, docking, composer-collision recovery, and normalized placement persistence remain exclusively STEP-07. No schema, DB, portable-format, permission, host-scope, dependency, popup, or execution-engine change is introduced.

---

## STEP-07 — Mini Controller Docking, Dragging, Accessibility, and Position Recovery

**Target:** `v0.0.23`  
**Purpose:** Make the secondary controller comfortable on real ChatGPT layouts without overlapping the composer or relying on drag-only interaction.  
**Depends on:** STEP-06.  
**Primary paths:** in-page presentation module, preferences, responsive/a11y tests.

### Work items

- [x] Define canonical dock/snap positions rather than persisting arbitrary unbounded coordinates.
- [x] At minimum support deterministic placements such as top-right, middle-right, bottom-right and bottom-left where viewport/layout allows.
- [x] Detect/avoid collision with the current sticky composer/control safe area; bottom-right must not be assumed safe.
- [x] Add optional pointer dragging from a dedicated handle/header with snapping to canonical positions.
- [x] Provide click/tap alternatives such as **Dock left/right**, **Move up/down** or position menu plus **Reset position** so dragging is never required.
- [x] Persist only normalized placement/collapsed preference through extension-owned small settings.
- [x] Clamp/recover safely after viewport resize, zoom, mobile/narrow layouts or ChatGPT layout change.
- [x] Preserve visible focus, keyboard operation, 44px-class comfortable touch targets where practical, forced-colors, reduced-motion and non-color state cues.
- [x] Ensure the controller remains outside ChatGPT pointer-events traps and does not block composer/send/scroll controls.

### Acceptance

- [x] Controller never loads off-screen after viewport/zoom changes.
- [x] Every drag placement can be achieved/reset with non-drag single-pointer controls.
- [x] Narrow and wide fixture layouts avoid known composer overlap zones.
- [x] Reduced-motion and forced-color behavior remain functional.
- [x] Placement preference corruption falls back to a safe canonical dock.

**P2 closes when STEP-07 is accepted.**

### Result

`v0.0.23` replaces the provisional fixed top-right mini-controller placement with a bounded canonical dock model. Six named docks (`top_left`, `middle_left`, `bottom_left`, `top_right`, `middle_right`, `bottom_right`) are the only durable placement vocabulary; arbitrary pixel coordinates never cross the content/background boundary and are never stored. Pointer dragging is available only from a dedicated trusted-event handle and snaps to one of those docks on release. The same six placements plus **Reset position** are available through ordinary single-pointer buttons, while the handle also supports Arrow-key movement and Home reset, so dragging is never required.

The presentation layer computes transient geometry from the preferred dock, current visual viewport, measured controller size and ChatGPT layout collision rectangles. Bottom placements are lifted above the current sticky thread-bottom/composer safe area when necessary while the requested dock remains the durable preference, so temporary composer growth, viewport resize, zoom or layout changes do not corrupt user preference. `BrowserChatGptLayoutAdvisor` keeps the ChatGPT-specific `#thread-bottom-container` / `[data-composer-surface="true"]` knowledge inside `src/chatgpt/`; the content entrypoint consumes only its collision-rectangle API and event-driven ResizeObserver notifications. The controller also listens to normal/visual viewport resize/scroll and its own ResizeObserver, clamps all computed geometry on-screen, limits expanded-card height, and falls back to the safe top-right dock when stored placement is invalid.

Placement remains a small background-owned trusted local-storage preference alongside collapse state under the existing `inpageController.v1` record. The controller presentation protocol remains schema v1 through additive `dock` compatibility: legacy `{schemaVersion:1, collapsed}` records normalize to `top_right`, while old content can ignore the extra field during extension-update overlap. The closed Shadow DOM, trusted user-event controls, single polite status region, 44px-class controls, reduced-motion, forced-colors, Side-Panel-primary hierarchy, sender/tab/conversation/generation authority, event-driven invalidation, no-polling rule, physical DB v1, logical/run v4, portable v1, permissions and host scope remain unchanged.

Focused STEP-07 validation passed 12/12; the strict presentation/layout TypeScript lane passed with `exactOptionalPropertyTypes`, the changed runtime server passed a strict dependency-free lane, content-entrypoint syntax passed, and the single untouched STEP-06 predecessor smoke passed 10/10 before implementation. WXT/Vue hydration remains inherited `deferred_environment`. **Phase P2 — Runtime Visibility and Secondary Control closes at v0.0.23.**

---

## STEP-08 — Adapter Drift, Observation, Error Classification, and Data-Retention Hardening

**Target:** `v0.0.24`  
**Purpose:** Consolidate production-facing ChatGPT drift resilience and minimize terminal retained content after the new surfaces are stable.  
**Depends on:** P2 complete.  
**Primary paths:** `src/chatgpt/`, `src/runs/`, `src/history/`, `src/diagnostics/`, `src/portability/`, tests.

### Work items

- [x] Reclassify ChatGPT DOM registry into **structural anchors** vs **transient capabilities**.
- [x] Prefer the visible `#prompt-textarea[contenteditable="true"]` composer and fail closed against hidden fallback textarea ambiguity.
- [x] Treat send/stop/Continue/voice controls as state-dependent capabilities; absence while idle is not automatically an adapter failure.
- [x] Add start-time structural preflight before a run receives send authority.
- [x] Add explicit degraded/reason codes for unsupported route, missing composer, capability unavailable, conversation mismatch, likely rate-limit/page alert and adapter drift.
- [x] Coalesce content observations so assistant text streaming does not publish a full semantically identical application-state update on every DOM mutation.
- [x] Keep response tracking event-driven and deadline-bounded; no fixed 400ms authority loop.
- [x] Compact terminal run state to remove unnecessary prompt-bearing/transient fields while retaining history/audit/recovery facts.
- [x] Reconcile full-backup portability with compacted/new run schemas; if the portable representation must break, introduce explicit format v2 while retaining v1 import adapters.
- [x] Audit diagnostics/history/controller/action projection for prompt/assistant leakage after compaction.
- [x] Add bounded retention/migration tests for old v0.0.16-era run snapshots and current successor snapshots.

### Acceptance

- [x] Idle ChatGPT with no send button remains healthy when structural composer/assistant requirements are satisfied.
- [x] Missing/ambiguous visible composer blocks send with explicit reason.
- [x] Streaming response fixture produces bounded semantic observations instead of update-per-text-mutation behavior.
- [x] Response completion/Continue behavior remains equivalent.
- [x] Terminal history and default configuration export do not retain/expose prompt bodies beyond explicitly documented sensitive full-backup compatibility needs.
- [x] Old accepted run/backup state remains readable or fails with explicit unsupported-schema semantics; never silently reinterpreted.

STEP-08 fast-path result: the focused hardening suite passed **11/11**, the focused adapter/caller/privacy compatibility lanes passed **18/18**, and the changed-source strict TypeScript lane passed. Adapter snapshots advance to **v4** with structural/capability/diagnostic classification and machine-readable degradation reasons; busy-stream fingerprint-only observations are event-driven and bounded/coalesced rather than mutation-for-mutation. Durable run/global logical state advances to **v5** solely for terminal execution-content compaction and explicit legacy normalization, while active/recovery content remains available until terminal transition. Physical IndexedDB and portable envelope remain **v1**. The single STEP-07 predecessor smoke was **11/12**: all 11 controller behavior checks passed and only a superseded static assertion that logical model must remain v4 failed; that retained assertion was reconciled for future accumulated runs and the predecessor lane was not rerun. WXT/Vue hydration remains inherited `deferred_environment`. **P3 remains active pending STEP-09.**

---

## STEP-09 — Integrated Successor Hardening Closure

**Target:** `v0.0.25`  
**Status:** complete / accepted roadmap closure.  
**Purpose:** Close ROADMAP-0002 only after all safety/privacy/timing/secondary-surface contracts are reconciled as one product.  
**Depends on:** STEP-08.  
**Primary paths:** integrated tests, Side Panel/in-page/action surfaces, records/docs/package checks.

### Work items

- [x] Execute normal-user integrated stories across Side Panel, toolbar indicator and mini controller.
- [x] Prove same-tab conversation switching cannot produce a send into the wrong conversation.
- [x] Prove caller authorization across Side Panel/background/content contexts.
- [x] Prove pause/resume remaining-delay semantics across worker restart.
- [x] Prove state/progress parity among Side Panel, toolbar title/badge and mini controller.
- [x] Prove mini controller lifecycle is non-authoritative and removable without run corruption.
- [x] Prove drag alternatives, focus, target sizing, reduced motion, forced colors and narrow viewport behavior.
- [x] Re-run privacy inspection for adapter payloads, diagnostics, history, terminal durable state and portable outputs.
- [x] Re-run permission/CSP/host/no-remote-code inspection.
- [x] Run full accumulated repository tests appropriate for formal closure.
- [x] Attempt WXT hydration/build/package and real Chrome/ChatGPT smoke once if the environment permits; classify unavailable infrastructure as `deferred_environment`, never pass.
- [x] Reconcile README, roadmap, ADR/constraint relations, matrices/reference/audit records and successor handoff.
- [x] Close ROADMAP-0002 without automatically authorizing `v0.1.0` or another roadmap.

### Closure acceptance

- [x] No known normal-user correctness defect remains in the successor scope.
- [x] Wrong-conversation prevention is fail-closed and explicitly tested.
- [x] Runtime caller authority no longer depends solely on self-declared envelope source.
- [x] Default runtime/diagnostic/history projections are privacy-minimal.
- [x] Side Panel remains primary; toolbar/mini controller are secondary projections with one state vocabulary.
- [x] No new duplicate orchestration engine or polling authority exists.
- [x] No unexplained permission/host/CSP expansion exists.
- [x] Environment-only unavailable package/browser lanes are explicitly `deferred_environment`.
- [x] ROADMAP-0002 closes without implicit semantic/public promotion.

**P3 and ROADMAP-0002 close only when STEP-09 is accepted.**

### Result

`v0.0.25` accepts the integrated successor closure. The first accumulated repository run produced **185/203** because 18 retained historical tests still pinned superseded package/schema/UI-shape facts; classification found no current runtime product defect. Those historical assertions were reconciled to preserve their original invariant under the authorized successor architecture, after which the pre-closure accumulated suite passed **203/203**. The dedicated STEP-09 closure suite passed **11/11**, the final accumulated repository suite passed **214/214**, strict dependency-free TypeScript passed across **110 source files**, and final static closure consistency passed **52/52**. These are the accepted local evidence recorded in `iteration_manifest.yaml`, `MATRIX-0002` and `AUDIT-0003`.

The one fresh package-infrastructure attempt, `npm install --ignore-scripts --no-audit --no-fund`, timed out after 120 seconds and left neither `node_modules` nor `package-lock.json`. Chromium is present at `/usr/bin/chromium`, but without a hydrated WXT build there is no package to launch honestly. WXT prepare/full Vue typecheck/build/package and packaged-Chrome/real-ChatGPT smoke are therefore **`DEFERRED_ENVIRONMENT`**, not passes and not product blockers.

No new workflow, permission, host scope, popup, execution engine, storage format or public-version promotion is introduced by closure. **P3 and ROADMAP-0002 are closed at 9/9 steps. No `v0.0.26`, `v0.1.0`, or successor roadmap is automatically authorized.**

# Cross-step acceptance matrix

| Concern | Owning step | Closure expectation |
| --- | --- | --- |
| Sender-derived caller trust | STEP-02 | Side Panel/content callers verified from actual runtime sender context |
| Composer privacy | STEP-02 | raw composer text content-local by default |
| Assistant fingerprint privacy | STEP-02 | no assistant text embedded in serialized baseline fingerprint |
| Same-tab wrong-conversation prevention | STEP-03 | fail-closed suspension + explicit rebind |
| New-chat first binding | STEP-03 | one safe `/ -> /c/<id>` adoption |
| Pause freezes remaining delay | STEP-04 | durable remainder semantics |
| Shared presentation vocabulary | STEP-04 | one projection drives all surfaces |
| Toolbar status | STEP-05 | badge/title only; click still opens Side Panel |
| Minimal in-page controls | STEP-06 | secondary Shadow DOM projection, no durable authority |
| Placement/drag accessibility | STEP-07 | dock/snap/reset alternatives + collision safety |
| DOM capability drift | STEP-08 | structural anchors separated from transient capabilities |
| Observation volume | STEP-08 | semantic coalescing, no 400ms polling |
| Terminal prompt retention | STEP-08 | compacted/minimized with compatibility adapters |
| Integrated privacy/security/recovery | STEP-09 | formal closure evidence |

# Master checklist

- [x] STEP-01 — Successor Hardening Evaluation, Evidence Freeze, and Roadmap Opening (`v0.0.17`).
- [x] STEP-02 — Runtime Caller Authority and Privacy-Minimal Adapter Contract (`v0.0.18`).
- [x] STEP-03 — Conversation Identity and Wrong-Conversation Send Prevention (`v0.0.19`).
- [x] STEP-04 — Timing Semantics and Unified Run Presentation Projection (`v0.0.20`).
- [x] STEP-05 — Toolbar Status and At-a-Glance Runtime Indicator (`v0.0.21`).
- [x] STEP-06 — Minimal In-Page Run Controller (`v0.0.22`).
- [x] STEP-07 — Mini Controller Docking, Dragging, Accessibility, and Position Recovery (`v0.0.23`).
- [x] STEP-08 — Adapter Drift, Observation, Error Classification, and Data-Retention Hardening (`v0.0.24`).
- [x] STEP-09 — Integrated Successor Hardening Closure (`v0.0.25`).

# Delivery governance

- Use the accepted current worktree/package as predecessor; do not recreate foundation scaffolds.
- Ordinary successor iterations use fast-path discipline: one authorized step, focused tests, at most one narrow predecessor smoke, selective record updates, one final portable ZIP, one publication operation.
- Do not create candidate/pre-ZIPs, checksum sidecars, standalone roadmaps, release summaries or cold-proof loops unless the owning step explicitly requires release/package evidence.
- Environment/tooling/network/auth/browser limitations are `deferred_environment`, non-blocking, and never masquerade as passes.
- Fresh web research is required only when current Chrome/WXT/WCAG behavior materially controls the owning step.
- User-provided current ChatGPT HTML is implementation evidence but not a permanent selector guarantee; selectors remain centralized and diagnostics must expose drift.
- ROADMAP-0001 remains closed history and is never rewritten to make the successor look inevitable.

# Change control

Material changes to any of the following require explicit ROADMAP-0002 revision and, when architectural, an ADR update/new ADR:

- Side Panel-primary hierarchy;
- addition of a conventional toolbar popup as primary/competing UI;
- conversation-binding semantics;
- sender/caller trust boundary;
- durable-authority ownership;
- new Chrome permissions or host scope;
- creation of another execution engine;
- relaxing privacy-minimal adapter/history boundaries;
- new workflow/domain types beyond hardening scope;
- automatic `v0.1.0` promotion.

Completed step history must not be rewritten as if later decisions were always present.

# Semi-handoff / continuation contract

This section is intentionally operational. A new session should be able to establish the accepted post-closure state directly from it.

## Accepted state after STEP-09

- **Promoted accepted closure baseline:** `v0.0.25`.
- **ROADMAP-0001:** closed historical authority at `v0.0.16`.
- **ROADMAP-0002:** **closed**, revision 9, 9/9 steps complete.
- **Phase P1 — Safety Authority:** complete.
- **Phase P2 — Runtime Visibility and Secondary Control:** complete.
- **Phase P3 — Drift/Retention and Closure:** complete.
- **Physical IndexedDB:** v1 unchanged.
- **Global logical model / durable run state:** v5.
- **Portable envelope:** v1 unchanged.
- **ChatGPT adapter:** v4.
- **Tab registry:** v2.
- **In-page controller protocol:** v1.
- **Chrome permissions:** exactly `sidePanel`, `storage`, `alarms`.
- **Content hosts:** only `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- **Toolbar action:** opens the Side Panel; there is no `default_popup`.

## Final authority contracts

- Caller authorization is derived from Chrome `MessageSender`; envelope `source` metadata is descriptive, not authority.
- Execution authority is `(tabId, windowId) + conversation binding + generation`. A new-chat run may bind once to its first `/c/<id>`; later same-tab conversation drift suspends fail-closed and requires explicit rebind.
- Repeat and Queue continue through one shared coordinator and retain point-of-click conversation verification.
- Paused delay owns frozen `remainingDelayMs`; active delay owns `nextDueAt`; Resume creates a fresh due time.
- `src/presentation/run-projection.ts` is the shared lifecycle/progress/timing/attention/action vocabulary for Side Panel, toolbar and in-page controller.
- The Side Panel remains the primary product with exactly **Run · Queue · Presets · Templates · Settings**. Toolbar status and the in-page controller are secondary projections.
- The in-page controller is disposable, closed-Shadow-DOM, prompt-free by default, generation-fenced, and cannot own durable run/configuration state. Its canonical dock preference stores names, not free pixel coordinates; transient composer/viewport collision correction never mutates durable placement preference.
- ChatGPT selector knowledge is separated into structural anchors, transient capabilities and diagnostics. Visible `#prompt-textarea[contenteditable="true"]` is the send structural anchor; hidden textarea fallback is diagnostic only.
- ChatGPT observation is MutationObserver/event-driven; busy fingerprint-only streaming is coalesced at a bounded 250ms publication boundary. There is no fixed 400ms execution polling loop.
- Adapter/runtime/history/controller projections remain privacy-minimal. Terminal Repeat/Queue execution state compacts prompt-bearing fields at run/logical v5; active/recovery state retains only what recovery requires until terminal transition.
- Physical IndexedDB and portable envelope remain independently v1; full backup remains sensitive and legacy accepted run schemas normalize explicitly.
- Permissions/host scope/CSP remain minimal; no remote executable runtime, `eval`, `new Function`, `<all_urls>`, `activeTab`, `debugger`, or `scripting` authority was introduced.

## Accepted closure evidence

- The reconciled pre-closure repository suite passed **203/203** after 18 stale historical assertions were updated; `AUDIT-0003` records the classification.
- `MATRIX-0002` is the integrated security/privacy/recovery/accessibility closure matrix and its disposition is **ACCEPTED**.
- The dedicated STEP-09 suite passed **11/11**; the final accumulated suite passed **214/214**; strict dependency-free TypeScript passed across **110 source files**; final static closure consistency passed **52/52**. The accepted `iteration_manifest.yaml` records the same evidence.
- One fresh npm hydration attempt timed out after 120 seconds and left no hydrated dependency tree. WXT/Vue build/package and packaged-Chrome/real-ChatGPT smoke are **`DEFERRED_ENVIRONMENT`**. Chromium presence alone is not a browser-smoke pass.

## Next authority

There is **no next authorized version, roadmap, or implementation step**. In particular, closure does not authorize `v0.0.26` or `v0.1.0`. Any further product change requires an explicitly created/authorized successor or superseding roadmap. ROADMAP-0001 and ROADMAP-0002 remain closed history and must not be rewritten to fabricate continuity.

## What not to infer

- The mini controller is not a replacement for the Side Panel.
- A conventional Chrome toolbar popup is not currently authorized.
- Presentation timing/reposition observers are not execution polling mechanisms.
- Current ChatGPT HTML selectors are evidence, not a guaranteed API.
- `DEFERRED_ENVIRONMENT` build/browser lanes are neither passes nor product failures.

# Revision history

| Date | Revision | Change | Status |
| --- | ---: | --- | --- |
| 2026-08-24 | 1 | Open successor hardening roadmap at v0.0.17 after v0.0.16 evaluation; freeze sender/privacy, conversation identity, truthful timing/projection, toolbar status, secondary in-page controller, docking/accessibility, adapter drift/retention and integrated closure ownership through v0.0.25. | active |
| 2026-08-24 | 2 | Complete STEP-02 at v0.0.18: enforce sender-derived runtime caller authority, introduce privacy-minimal ChatGPT adapter v2 and run-state/logical-model v2 compatibility migration, preserve physical DB/export v1, and authorize STEP-03 only. | active |
| 2026-08-24 | 3 | Complete STEP-03 at v0.0.19: add semantic conversation context, durable independent conversation binding, one-time new-chat adoption, fail-closed same-tab mismatch suspension/rebind, point-of-click conversation verification, and shared Repeat/Queue guarding; close P1 and authorize STEP-04 only. | active |
| 2026-08-24 | 4 | Complete STEP-04 at v0.0.20: freeze paused delay as durable remaining duration, resume from a fresh due time, add response elapsed authority, introduce the pure shared RunPresentationProjection and centralized semantic tones, move the Side Panel run card to that projection, advance logical/run schema to v4 only, and authorize STEP-05. | active |
| 2026-08-24 | 5 | Complete STEP-05 at v0.0.21: add a background-owned toolbar badge/title adapter over RunPresentationProjection, deterministic global/per-tab multi-run aggregation, presentation-only countdown/elapsed boundary refresh, stale action cleanup and worker reconstruction from durable runs; preserve toolbar-click to Side Panel, no popup, no schema/permission change, and authorize STEP-06. | active |
| 2026-08-24 | 6 | Complete STEP-06 at v0.0.22: add a secondary closed-Shadow-DOM in-page status/controller over RunPresentationProjection, sender-derived same-tab generation-fenced Pause/Resume/Stop, explicit conversation-guarded Resume, background-owned collapse preference, trusted-event controls, event-driven invalidation and presentation-only temporal updates; preserve Side Panel primary authority, no quick-start opt-in, no schema/permission/popup change, and authorize STEP-07. | active |
| 2026-08-24 | 7 | Complete STEP-07 at v0.0.23: add six canonical dock positions, trusted dedicated-handle drag-to-snap, equivalent single-pointer and keyboard placement/reset controls, background-owned normalized dock persistence with legacy/corruption recovery, visual-viewport/off-screen clamping, ChatGPT-layer sticky-composer collision avoidance and event-driven resize/layout recovery; close P2 with no execution/schema/permission/popup change and authorize STEP-08. | active |
| 2026-08-24 | 8 | Complete STEP-08 at v0.0.24: classify ChatGPT selectors as structural/capability/diagnostic, enforce exact visible-composer preflight, add adapter v4 machine-readable degradation reasons, bound event-driven stream observations, compact terminal Repeat/Queue prompt-bearing execution state through run/logical v5 with explicit 4->5 migration and legacy normalization, preserve physical DB/portable v1, keep P3 active, and authorize STEP-09 closure only. | active |
| 2026-08-24 | 9 | Accept STEP-09 at v0.0.25 after integrated successor security/privacy/recovery/accessibility reconciliation, 203/203 reconciled pre-closure accumulated tests, dedicated closure evidence, one truthful package-infrastructure deferral, and closure records MATRIX-0002/AUDIT-0003; close P3 and ROADMAP-0002 at 9/9 with no automatic successor authorization. | closed |
