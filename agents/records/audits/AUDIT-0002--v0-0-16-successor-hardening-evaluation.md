---
schema_version: 1
record_id: AUDIT-0002
record_type: audit
slug: v0-0-16-successor-hardening-evaluation
title: "v0.0.16 Successor Hardening Evaluation"
status: complete
revision: 1
created_at: 2026-08-24T11:26:00+08:00
updated_at: 2026-08-24T11:26:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [src/, entrypoints/, tests/, agents/records/]
relations:
  related: [ROADMAP-0001, ROADMAP-0002, ADR-0001, CONSTRAINT-0001, REFERENCE-0006]
  depends_on: [ROADMAP-0001]
  blocks: []
  supersedes: []
  superseded_by: []
provenance:
  created_from:
    type: iteration
    id: roadmap-0002-step-01.v0.0.17
tags: [audit, hardening, privacy, conversation-identity, mini-controller, runtime]
---
# AUDIT-0002 — v0.0.16 Successor Hardening Evaluation

## Scope

Evaluate the closed v0.0.16 product for the user's requested successor direction: recover a minimal original-userscript-style in-page control surface that coexists with the Side Panel, improve state/progress/countdown visibility, and identify additional high-value hardening without expanding workflow breadth.

## Overall disposition

**Successor roadmap warranted.** The current product is architecturally mature; the highest-value remaining work is correctness/privacy/interaction hardening rather than new workflow/domain features.

## Findings

| Priority | Finding | Current evidence | Disposition |
| --- | --- | --- | --- |
| Critical | Run is tab-bound but not conversation-bound | `DurableRunSnapshot` stores tab/window IDs only; ChatGPT uses same-tab SPA conversation routes | Promote to ROADMAP-0002 STEP-03 |
| High | Runtime transports/retains more text than needed | raw `composerDraft`; assistant signature contains text suffix; active/queue/repeat run state contains messages | Promote to STEP-02 + STEP-08 |
| High | Runtime servers rely on self-declared envelope source for caller class | `request.source === 'sidepanel'`/`content` checks | Promote to STEP-02 sender-derived authority |
| High | Pause does not freeze remaining inter-iteration delay | absolute `nextDueAt` survives pause | Promote to STEP-04 |
| High | Status visibility drops when Side Panel is closed | no shared badge/mini projection | STEP-04 projection + STEP-05 toolbar + STEP-06 controller |
| Medium | Old userscript interaction shape remains valuable | fixed Shadow DOM launcher/panel + status + direct run controls | Recover as secondary controller in STEP-06 |
| Medium | Fixed bottom-right can collide with current sticky composer | current ChatGPT HTML exposes sticky bottom composer region | STEP-07 docking/collision recovery |
| Medium | Send/stop controls are transient capabilities | current idle capture exposes voice control and no send/stop test IDs | STEP-08 structural-vs-capability registry |
| Medium | Streaming assistant changes can produce high observation churn | adapter fingerprints full snapshot including assistant signature changes | STEP-08 semantic coalescing |
| Environment | Real WXT/package/Chrome smoke remains incomplete | v0.0.16 npm hydration timed out | Keep `deferred_environment`; retry only when owning closure step/environment changes |

## UI recommendation

Do **not** make a conventional Chrome toolbar popup the successor centerpiece. The toolbar action already intentionally opens/toggles the Side Panel. Prefer:

- Side Panel = full product;
- toolbar badge/title = at-a-glance status;
- in-page Shadow DOM mini controller = quick controls for the local verified run;
- background/application authority = canonical state for all surfaces.

Optional dragging is acceptable only as enhancement with non-drag dock/snap/reset controls.

## Product-direction recommendation

Do not spend this successor program on more workflow types, branching/DAG concepts, additional definition domains or another large setup/configuration surface. Protect in order:

1. wrong-conversation prevention;
2. privacy-minimal caller/adapter authority;
3. truthful timing/progress projection;
4. original-script-style secondary mini controller;
5. adapter drift/observation/data-retention hardening;
6. integrated field/package closure.

## Result

ROADMAP-0002 opened with `v0.0.17` as planning/evidence freeze and `v0.0.18` as the sole next implementation step. No product/runtime/test behavior changed in this audit iteration.
