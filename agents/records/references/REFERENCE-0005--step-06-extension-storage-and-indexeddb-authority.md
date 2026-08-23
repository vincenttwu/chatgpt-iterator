---
schema_version: 1
record_id: REFERENCE-0005
record_type: reference
slug: step-06-extension-storage-and-indexeddb-authority
title: "STEP-06 Extension Storage and IndexedDB Authority"
status: active
revision: 1
created_at: 2026-08-24T03:05:00+08:00
updated_at: 2026-08-24T03:05:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [src/persistence/, entrypoints/background.ts, wxt.config.ts]
relations:
  related: [ROADMAP-0001, ADR-0001]
  depends_on: [REFERENCE-0001]
  blocks: []
  supersedes: []
  superseded_by: []
provenance:
  created_from:
    type: iteration
    id: roadmap-0001-step-06.v0.0.6
tags: [reference, chrome-extension, indexeddb, storage, persistence, migration]
---
# REFERENCE-0005 — STEP-06 Extension Storage and IndexedDB Authority

## Purpose

Refresh the first-party storage facts that materially control ROADMAP-0001 STEP-06 and freeze the persistence boundaries used by `chatgpt-iterator` v0.0.6.

## First-party authority refreshed 2026-08-24

Chrome for Developers documents the following material facts:

- extension-origin IndexedDB is shared by trusted extension contexts such as the extension service worker and extension pages, including the Side Panel;
- a content script using IndexedDB accesses the host page origin rather than the extension origin, so the ChatGPT content adapter must never own application database access;
- extension service workers can use IndexedDB, while Web Storage (`localStorage`/`sessionStorage`) is not available to the worker;
- `chrome.storage` requires the `storage` permission;
- `storage.local` is device-local and currently has a 10 MB default quota;
- `storage.session` is in-memory for the extension/browser session, currently has a 10 MB quota, and is restricted to trusted contexts by default;
- `storage.sync` is intended for small synced settings and is quota constrained (approximately 100 KB total and 8 KB per item);
- `setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` can prevent local/sync areas from being exposed to content scripts.

Sources:

- Chrome for Developers — Storage and cookies: https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
- Chrome for Developers — `chrome.storage`: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome for Developers — Extension service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

## Accepted v0.0.6 disposition

1. **IndexedDB is canonical application persistence.** Physical v1 contains `metadata`, `templates`, `presets`, `queues`, `queueItems`, `runs`, and `runEvents` stores.
2. **The service worker owns application persistence access.** Side Panel/application code obtains durable state through background/control-plane services rather than treating direct page-local state as canonical. The extension-origin sharing property remains useful for future migration/maintenance tools, but does not authorize UI ownership of durable state.
3. **The ChatGPT content script owns no application storage.** It remains a thin DOM adapter and can exchange only versioned messages with background authority.
4. **Chrome storage tiers are auxiliary.** `local` is device-local bootstrap/UI preference state, `session` is browser-session coordination/reconnect state, and `sync` is small sync-safe preference state. Queues, templates, presets, run history, and messages never move to these tiers merely for convenience.
5. **Trusted-context access is enforced.** Background initialization restricts local/session/sync access to trusted extension contexts.
6. **No `unlimitedStorage` permission is introduced.** The initial product remains bounded and observes actual quota behavior; a future change requires evidence and explicit authority.
7. **Physical, logical, and portable versions are independent.** IndexedDB physical version, logical domain-model version, and future export-format version may advance independently.
8. **Physical upgrades stay short.** IndexedDB `versionchange` creates/changes stores/indexes only. Logical data migrations run after open with explicit resumable metadata and must not perform long migration work inside the exclusive physical upgrade transaction.
9. **Queue/item replacement and future import application are transaction boundaries.** Partial queue or configuration writes are not acceptable durable states.

## Revision history

| Date | Revision | Change | Status |
| --- | ---: | --- | --- |
| 2026-08-24 | 1 | Freeze STEP-06 IndexedDB/storage-tier/migration authority from current first-party Chrome documentation. | active |
