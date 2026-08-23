---
schema_version: 1
record_id: MATRIX-0001
record_type: matrix
slug: integrated-team-side-panel-closure
title: "Integrated Team Side Panel Closure Matrix"
status: accepted
revision: 1
created_at: 2026-08-24T04:48:00+08:00
updated_at: 2026-08-24T04:48:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [entrypoints/sidepanel/, src/ui/, public/_locales/en/, tests/]
relations:
  related: [ROADMAP-0001, CONSTRAINT-0001, REFERENCE-0002]
  depends_on: [CONSTRAINT-0001, REFERENCE-0002]
  blocks: []
  supersedes: []
  superseded_by: []
provenance: {created_from: {type: iteration, id: "v0.0.16"}}
tags: [matrix, ui, accessibility, closure, crsniffer]
---
# MATRIX-0001 — Integrated Team Side Panel Closure Matrix

This matrix closes the ROADMAP-0001 requirement to compare every applicable ChatGPT Iterator Side Panel primitive with the mandatory CRSniffer team standard. The disposition is semantic reuse/adaptation, not visual cloning.

| Team-standard primitive | Iterator disposition | Evidence | Deviation |
| --- | --- | --- | --- |
| Vue/WXT Side Panel shell | Adopted | `entrypoints/sidepanel/App.vue`, `main.ts`, `style.css` | None |
| Five primary workspaces | Adopted as Run · Queue · Presets · Templates · Settings | `src/ui/workspaces.ts`, accessible tablist in `App.vue` | Product-specific workspace names are the authorized mapping from REFERENCE-0002, not a deviation |
| Accessible roving tabs | Adopted | `role=tablist`, `role=tab`, `aria-selected`, `aria-controls`, roving `tabindex`, Arrow/Home/End keyboard handling | None |
| Header/status lane | Adopted | Product header, authority state, one canonical `role=status` + `aria-live=polite` lane | None |
| State badge grammar | Adopted | runtime/run/definition/diagnostic state badges | None |
| Card/surface hierarchy | Adopted | native `details`/`summary` workspace cards, field stacks, action rows, notices | None |
| Reusable-definition lifecycle | Adopted | Presets/Templates/Queues use New, Load, Save As, Update, Reset, Duplicate, Delete | Queue additionally owns ordered-item editing as required by product semantics |
| Ordered-list interaction | Adopted | Queue Move Up / Move Down / Remove controls; no drag-only authority | None |
| Explicit loading/degraded/stale/reconnecting language | Adopted | Run lifecycle notices, stale working-copy guards, diagnostics states | None |
| Narrow Side Panel compression | Adopted | container-query tab compression, 320px/360px one-column reflow, overflow-safe fields | None |
| Minimum target sizing | Adopted | 2.75rem control floor; 1.5rem check controls inside clickable rows | None |
| Focus visibility | Adopted | 3px system Highlight outline with offset and scroll margin | None |
| Reduced motion | Adopted | `prefers-reduced-motion: reduce` | None |
| Forced/high-color compatibility | Adopted | system colors plus `forced-colors: active` override | None |
| Localization-ready copy | Adopted | `src/ui/messages.ts` fallback catalog exactly projected to `public/_locales/en/messages.json` | None |
| Chrome-native-aware theming | Adopted using later accepted authority | `color-scheme: light dark`, Canvas/CanvasText/Highlight/system controls | Deliberately does not copy the donor's older fixed palette; REFERENCE-0002 explicitly requires the later system/native-aware authority |
| Single polite live-status lane | Adopted | one hidden atomic polite status lane; visible warnings are not competing live regions | None |
| Direct-first Run entry | Product-specific composition of standard fields/actions | Run is the initial workspace and requires no Setup/Preset gate | Required product semantic, consistent with CONSTRAINT-0001 |

## Closure disposition

No competing interaction system, Bootstrap layer, drag-only ordering model, private Chrome WebUI theme dependency, or second live-status channel remains. Product-specific differences are limited to domain semantics already authorized by ROADMAP-0001 and REFERENCE-0002.
