---
schema_version: 1
record_id: REFERENCE-0003
record_type: reference
slug: step-02-current-toolchain
title: "STEP-02 Current WXT Vue TypeScript Toolchain"
status: active
revision: 2
created_at: 2026-08-23T18:42:00Z
updated_at: 2026-08-24T04:48:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [package.json, wxt.config.ts, entrypoints/, src/ui/]
relations:
  related: [ROADMAP-0001, CONSTRAINT-0001, REFERENCE-0002]
  depends_on: []
  blocks: []
  supersedes: []
  superseded_by: []
provenance: {created_from: {type: iteration, id: "v0.0.2"}}
tags: [reference, step-02, wxt, vue, typescript, toolchain]
---
# REFERENCE-0003 — STEP-02 Current WXT Vue TypeScript Toolchain

## Fresh package authority

Checked on 2026-08-24 Asia/Taipei before STEP-02 implementation:

- WXT `0.21.4` — current npm stable/latest line.
- Vue `3.5.41` — current npm `latest`; Vue 3.6 remained prerelease.
- `@wxt-dev/module-vue` `1.0.3` — current published module-vue release.
- TypeScript `7.0.2` — current npm stable/latest line.
- `vue-tsc` `3.3.11` — newest published line observed; selected exactly for the scaffold.

Sources: npm package pages for `wxt`, `vue`, `@wxt-dev/module-vue`, `typescript`, and `vue-tsc`.

## Disposition

STEP-02 pins the above exact package versions rather than copying CRSniffer's older WXT/vue-tsc pins. The current execution container provides Node `v22.16.0` and npm `10.9.2`; the project therefore requires Node `>=22` but does not claim this container's npm version as project authority.

A single `npm install --ignore-scripts --no-audit --no-fund` hydration attempt timed out after 120 seconds and produced neither `node_modules` nor a lockfile. WXT prepare/typecheck/build are therefore `deferred_environment` for this iteration, not reported as passes.

## STEP-16 closure recheck

The pinned package authority remains unchanged at v0.0.16. A single fresh closure attempt using `npm install --ignore-scripts --no-audit --no-fund` again timed out after 120 seconds and produced neither `node_modules` nor `package-lock.json`. Chromium is present, but without a hydrated WXT build there is no truthful generated extension bundle to launch. WXT prepare/typecheck/build/package/install smoke therefore remains `deferred_environment`; repository-controlled source/type/integrated verification proceeds independently.
