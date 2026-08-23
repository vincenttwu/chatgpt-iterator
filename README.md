# ChatGPT Iterator — v0.0.2

Chrome-native Side Panel foundation for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-02 is complete. This version introduces the first executable WXT + Vue 3 + TypeScript Manifest V3 shell and enforces the CRSniffer Side Panel interaction system as the team UI standard.

The exact originally requested `chatgpt-iterator-v0.0.0` archive is still unavailable in this execution context. The user explicitly authorized continuation from the accepted v0.0.1 planning overlay, so v0.0.2 is the forward implementation root. It does **not** claim fabricated byte-for-byte ancestry from the missing archive; if that archive becomes available later it is provenance/reconciliation input, not permission to overwrite accepted successor work.

## Implemented in v0.0.2

- WXT `0.21.4`, Vue `3.5.41`, `@wxt-dev/module-vue` `1.0.3`, TypeScript `7.0.2`, and `vue-tsc` `3.3.11` exact pins.
- Chrome 132+ Manifest V3 configuration.
- Minimal `sidePanel` permission floor; no host, scripting, debugger, activeTab, storage, or unrelated permissions yet.
- Toolbar action opens the global Side Panel.
- Five team-standard workspaces: **Run · Queue · Presets · Templates · Settings**.
- CRSniffer-standard accessible tabs, header/status lane, surface/card grammar, icon component, narrow-panel icon compression, focus visibility, reduced-motion and forced-color behavior.
- Native-aware system-color theme instead of fixed Google/Material palette.
- UI copy externalized through Chrome localization messages.

## Validation

- `npm run test:step02`: **6/6 PASS**.
- One package hydration attempt (`npm install --ignore-scripts --no-audit --no-fund`) timed out after 120 seconds and produced no lockfile/node_modules. WXT prepare/typecheck/build are **DEFERRED_ENVIRONMENT**, not passes and not blocking under fast-path policy.

## Next authorized step

ROADMAP-0001 **STEP-03 / v0.0.3 — Versioned Cross-Context Contracts and Control Plane**.

## Reference inputs

`dumps/donors/` remains read-only reference material. Product source owns its own contracts and implementation.
