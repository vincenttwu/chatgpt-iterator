---
schema_version: 1
record_id: CONSTRAINT-0001
record_type: constraint
slug: team-side-panel-ui-standard
title: "Team Side Panel UI Standard"
status: active
revision: 3
created_at: 2026-08-23T18:34:00Z
updated_at: 2026-08-24T14:08:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [entrypoints/sidepanel/, src/ui/, tests/ui/]
relations:
  related: [ROADMAP-0001, ROADMAP-0002, MATRIX-0001, MATRIX-0002, REFERENCE-0002]
  depends_on: [REFERENCE-0002]
  blocks: []
  supersedes: []
  superseded_by: []
provenance: {created_from: {type: iteration, id: "v0.0.1"}}
tags: [constraint, ui, side-panel, team-standard, vue, accessibility]
---
# CONSTRAINT-0001 — Team Side Panel UI Standard

## Constraint

CRSniffer's established Side Panel interaction system is the team-standard denominator for ChatGPT Iterator. Where an existing pattern serves the same semantic purpose, Iterator **MUST reuse or adapt it rather than invent a parallel pattern**.

## Required reuse/adaptation surfaces

- Vue/WXT Side Panel application shell and component composition;
- primary accessible tab navigation, including keyboard behavior, roving `tabindex`, `aria-selected`, and `tabpanel` ownership;
- header/status lane and bounded state-badge grammar;
- card/surface hierarchy, form stacks, supporting copy, actions, notices and progressive disclosure;
- reusable-definition lifecycle: New, load/hydrate working copy, Save As, Update, Reset, Duplicate, Delete;
- structured ordered-list interaction with explicit Move Up / Move Down / Remove controls;
- narrow Side Panel reflow, icon-preserving navigation compression, minimum target sizing and overflow safety;
- focus visibility, single polite live-status lane, reduced-motion behavior, high/forced-color compatibility and localization-ready copy;
- Chrome-native-aware presentation using public platform/system theme mechanisms rather than private Chrome WebUI tokens.

## Product-specific adaptation

Iterator may rename concepts and compose standard primitives differently where Run, Queue, Preset, Template, Settings, tab-target, or execution semantics require it. Product semantics always win over superficial visual parity.

## Deviation rule

A new competing interaction/layout pattern is allowed only when a concrete Iterator semantic, accessibility, browser-platform, or capability requirement cannot be represented correctly by the team standard. The deviation must be explicit in the owning roadmap step or ADR and must not be justified solely by taste or framework convenience.

## Bootstrap disposition

Bootstrap 5 is **not** a UI authority for the baseline roadmap. Do not add it merely to recreate components already covered by the team standard. A later bounded dependency may be introduced only for a demonstrated capability that preserves this constraint.

## ROADMAP-0001 closure disposition

At v0.0.16 this constraint remains **active** beyond ROADMAP-0001. `MATRIX-0001` verifies the accumulated Side Panel against every applicable required reuse surface. Closure specifically reconciled the single-polite-status-lane requirement, minimum target sizing, complete locale projection, narrow reflow, focus, reduced motion and forced colors. No competing Bootstrap/design-system layer or unexplained interaction deviation is accepted.

## ROADMAP-0002 closure disposition

At v0.0.25 the constraint remains **active**. The full Side Panel is still the primary product surface and keeps the exact five-workspace team-standard shell. ROADMAP-0002 adds only two secondary projections: toolbar badge/title and a compact in-page controller. Neither is a competing application shell or configuration system.

The in-page controller's placement interaction is an explicit product-specific/accessibility deviation owned by STEP-07: trusted drag is optional, snaps only to canonical docks, and every placement/reset is also reachable through ordinary pointer controls and keyboard commands. MATRIX-0002 confirms that these secondary surfaces preserve the Side-Panel-primary hierarchy, single presentation vocabulary, focus/target/reduced-motion/forced-color expectations, and do not introduce a parallel design system.
