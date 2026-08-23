---
schema_version: 1
record_id: REFERENCE-0001
record_type: reference
slug: current-chrome-extension-runtime-authority
title: "Current Chrome Extension Runtime Authority"
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
  paths: [agents/records/research-data/20260824/, src/runtime/, src/tabs/, src/persistence/]
relations:
  related: [ROADMAP-0001, ADR-0001]
  depends_on: []
  blocks: []
  supersedes: []
  superseded_by: []
provenance: {created_from: {type: iteration, id: "v0.0.1"}}
tags: [reference, chrome, mv3, side-panel, tabs, service-worker, indexeddb, alarms]
---
# REFERENCE-0001 — Current Chrome Extension Runtime Authority

Accessed 2026-08-24 Asia/Taipei. First-party/current sources control platform claims.

## Sources

- Chrome Side Panel API — https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Chrome Tabs API — https://developer.chrome.com/docs/extensions/reference/api/tabs
- Extension service-worker lifecycle — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Extension storage and cookies — https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
- Extension message passing — https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Chrome Alarms API — https://developer.chrome.com/docs/extensions/reference/api/alarms
- WXT entrypoints — https://wxt.dev/guide/essentials/entrypoints.html

## Material facts

- `chrome.sidePanel` is MV3, available from Chrome 114, persists as a companion surface across tabs when configured, and Side Panel pages are extension pages with Chrome API access.
- `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` supports direct toolbar-action opening.
- Extension service workers are normally terminated after 30 seconds of inactivity; global memory is therefore not durable authority.
- Incoming extension events can wake a sleeping service worker; message APIs support service-worker/extension-page/content-script communication.
- `Tab.frozen` is available from Chrome 132. A frozen tab cannot execute tasks, including event handlers or timers. `discarded` means page contents were unloaded. `autoDiscardable` controls browser automatic discard eligibility.
- Extension-origin web storage is shared by the service worker and extension pages. IndexedDB is available in service workers. A content script's web-storage calls use the host page origin instead of the extension origin.
- Packaged Chrome alarms are limited to at most once every 30 seconds and may be delayed further; they are not a 5–7 second iteration timer.
- WXT recognizes `entrypoints/sidepanel/index.html` as the default `/sidepanel.html` entrypoint.

## Architecture consequence

These facts support ADR-0001 and the Chrome 132+ baseline. They do not promise that ChatGPT's page DOM can execute while Chrome has frozen or discarded the target tab.
