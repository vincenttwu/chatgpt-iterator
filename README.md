# ChatGPT Iterator — v0.0.9

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-09 is complete and Phase P3 is active. The product now exposes the durable Repeat runtime through the enforced five-tab team-standard Side Panel, with **Run** as the direct-first normal entry point.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.9

- Preserved the exact primary information architecture: **Run · Queue · Presets · Templates · Settings**.
- Reused the CRSniffer team-standard shell, tabs, collapsible cards, field stacks, action grammar, status badges, narrow-panel reflow, keyboard/focus behavior, reduced-motion and forced-color treatment.
- Run is the primary operational workspace; later workspaces remain bounded placeholders until their owning roadmap steps.
- Eligible ChatGPT tabs load into an explicit target picker with Refresh and binding; browser active-tab changes never silently retarget a run.
- Preset selection is present but optional: direct configuration remains the default and does not require saved setup ceremony.
- Repeat form exposes message text, 1–10000 iterations, 5–3600 second delay, Auto-continue and Auto-scroll.
- Start creates and starts durable generation-fenced run authority; existing ready runs can be started, and active runs expose Pause/Resume/Stop as lifecycle permits.
- Current run state, target, completed/total progress, current iteration and update time are visible without making panel state canonical.
- Frozen, discarded, failed and Side Panel reconnect states have explicit truthful explanations.
- Runtime invalidations now distinguish `tab_changed` and `run_changed`, so streaming ChatGPT observations do not force run-list hydration.
- No Bootstrap or competing component/layout grammar was introduced.

## Validation

- `npm run test:step09`: **8/8 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check for the new Run UI/runtime client and its core run/tab contracts: **PASS** with TypeScript 5.8.3.
- STEP-08 Repeat execution suite is the one narrow predecessor smoke: **9/9 PASS**.
- WXT dependency hydration/prepare/full Vue typecheck/build remain inherited **DEFERRED_ENVIRONMENT**; no dependency changed and the unavailable package lane was not retried.

## Next authorized step

ROADMAP-0001 **STEP-10 / v0.0.10 — Templates Workspace and Variable Contract**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. The CRSniffer Side Panel interaction grammar is an enforced team standard, not optional design inspiration.
