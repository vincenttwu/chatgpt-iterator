---
schema_version: 1
record_id: REFERENCE-0002
record_type: reference
slug: crsniffer-team-side-panel-standard
title: "CRSniffer Team Side Panel Standard"
status: active
revision: 1
created_at: 2026-08-23T18:34:00Z
updated_at: 2026-08-23T18:34:00Z
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [entrypoints/sidepanel/, src/ui/, tests/ui/, dumps/donors/crxsniffer/]
relations:
  related: [ROADMAP-0001, CONSTRAINT-0001, ADR-0001]
  depends_on: []
  blocks: []
  supersedes: []
  superseded_by: []
provenance: {created_from: {type: iteration, id: "v0.0.1"}}
tags: [reference, team-standard, crsniffer, side-panel, vue, wxt, accessibility]
---
# REFERENCE-0002 — CRSniffer Team Side Panel Standard

## Source

`dumps/donors/crxsniffer/crxsniffer-repomix-output.xml` is the immutable packed repository supplied by the user and designated as team-standard UI/layout authority.

Useful source paths inside the packed repository include:

- `entrypoints/sidepanel/App.vue`
- `entrypoints/sidepanel/components/Icon.vue`
- `entrypoints/sidepanel/style.css`
- `src/ui/`
- `tests/ui/ui.test.ts`
- `docs/reference/native-chrome-theme.md`
- `docs/reference/ui-interaction-authority.md`
- `agents/records/matrices/MATRIX-0016--whole-product-ui-ux-interaction-grammar-and-roadmap-ownership.md`

## Adopted standard

Iterator adopts the stable interaction grammar rather than product-specific CRSniffer domains:

- shell + header + single status lane;
- accessible top-level workspace tabs;
- responsive icon-preserving compression;
- collapsible card/surface hierarchy;
- field-stack and action-row form grammar;
- state badges/notices and explicit loading/error/degraded/stale language;
- reusable-object working-copy lifecycle;
- explicit non-drag ordered-list controls;
- keyboard/focus/minimum-target/reduced-motion/high-contrast contracts;
- Chrome-native-aware public theme strategy.

## Important theme reconciliation

The packed repository contains older fixed Material/Google-style palette declarations and later project authority that rejects a fixed Google-blue palette in favor of system/native-aware colors. Iterator follows the **later accepted theme authority**: system typography, `color-scheme`, CSS system colors, native controls and forced-color compatibility. Layout/interaction grammar remains reusable.

## Product-specific mapping

CRSniffer workspaces map conceptually to Iterator as follows:

- primary runtime workspace -> `Run`
- ordered structured editing -> `Queue`
- reusable definitions -> `Presets` and `Templates`
- settings/diagnostics -> `Settings`

This mapping is semantic reuse, not a code-name transplant.
