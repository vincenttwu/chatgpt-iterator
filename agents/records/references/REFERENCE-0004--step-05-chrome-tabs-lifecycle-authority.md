---
schema_version: 1
record_id: REFERENCE-0004
record_type: reference
slug: step-05-chrome-tabs-lifecycle-authority
title: "STEP-05 Current Chrome Tabs Lifecycle Authority"
status: active
revision: 1
created_at: 2026-08-23T18:57:00Z
updated_at: 2026-08-23T18:57:00Z
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [src/tabs/, src/runtime/, entrypoints/background.ts, entrypoints/chatgpt.content.ts]
relations:
  related: [ROADMAP-0001, ADR-0001, REFERENCE-0001]
  depends_on: [ADR-0001]
  blocks: []
  supersedes: []
  superseded_by: []
provenance: {created_from: {type: iteration, id: "v0.0.5"}}
tags: [reference, step-05, chrome, tabs, lifecycle, frozen, discarded]
---
# REFERENCE-0004 — STEP-05 Current Chrome Tabs Lifecycle Authority

## Current first-party authority refreshed 2026-08-24 Asia/Taipei

Chrome's current `chrome.tabs` documentation confirms the STEP-05 browser contract:

- the Tabs API is available to extension service workers/pages, not content scripts;
- `Tab.autoDiscardable` is writable through `tabs.update()` and represents whether Chrome may automatically discard a tab under resource pressure;
- `Tab.discarded` means the tab content has been unloaded and reloads when activated;
- `Tab.frozen` is available from Chrome 132+, and a frozen tab cannot execute tasks such as handlers or timers until it is unfrozen;
- `tabs.onUpdated` reports `autoDiscardable`, `discarded`, `frozen`, status and URL changes;
- `tabs.onRemoved` reports target closure;
- `tabs.onReplaced` reports browser replacement of a tab, including prerender/instant replacement;
- basic tab-management API use does not itself require the broad `tabs` permission; that permission principally exposes sensitive URL/title/favicon properties outside already-authorized host access.

Sources:

- https://developer.chrome.com/docs/extensions/reference/api/tabs
- https://developer.chrome.com/docs/web-platform/page-lifecycle-api

## Product disposition

Iterator keeps Chrome 132 as its minimum baseline and does not add the broad `tabs` permission in STEP-05. Discovery is constrained to the existing ChatGPT content-script host scope. The registry treats frozen, discarded, loading, unavailable and closed conditions as explicit states rather than attempting to force hidden-page execution.

An explicit target binding is independent of whichever browser tab the user later activates. `autoDiscardable=false` is temporary run-owned protection only; guard ownership records the original value and restores it when the final owner releases the tab. This protection does not claim to prevent freezing.
