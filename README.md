# ChatGPT Iterator — v0.0.4

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-04 is complete. This version isolates volatile ChatGPT DOM knowledge behind one content-side semantic adapter and replaces the working userscript's short-interval DOM polling with event-driven observation contracts.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.4

- Host-scoped WXT content entrypoint for `chatgpt.com` and `chat.openai.com` only.
- Central `src/chatgpt/` selector registry for the verified composer, send, stop, Continue and assistant-message surfaces, with localized fallback matching where the userscript already proved it useful.
- Semantic `ChatGptAdapter` snapshots/commands for readiness, busy state, assistant signature, draft state, send, Continue, stop and scroll without exposing DOM nodes outside the adapter boundary.
- Empty-draft safety before sending and a captured assistant-response baseline to prevent later duplicate-send ambiguity.
- MutationObserver-driven wait-for-send and semantic state observation; no short-interval page polling loop is introduced.
- Event-driven `ResponseCompletionTracker` preserving response-start timeout, Continue, activity and stable-completion semantics while leaving scheduling ownership to later runtime steps.
- Required/conditional selector-health diagnostics plus visible page-alert degradation state.
- Content-side versioned envelope server for `chatgpt.snapshot`, `chatgpt.diagnostics`, `chatgpt.send`, `chatgpt.continue`, `chatgpt.stop` and `chatgpt.scroll`.
- No remotely hosted `chatgpt.js` or other remote executable dependency.
- No tab registry/lifecycle ownership, IndexedDB, durable run engine, Repeat/Queue execution or later UI behavior is pulled forward.

## Validation

- `npm run test:step04`: **9/9 PASS** using Node's TypeScript stripping lane.
- Dependency-free `src/core/*.ts` + `src/chatgpt/*.ts` strict TypeScript check: **PASS** with available TypeScript 5.8.3.
- Selector-boundary inspection: **PASS** — no `querySelector` lookup exists in product `entrypoints/` or `src/` outside `src/chatgpt/`.
- STEP-03 control-plane suite is the one narrow predecessor smoke for this iteration.
- WXT dependency hydration/prepare/full extension typecheck/build remain inherited **DEFERRED_ENVIRONMENT** from v0.0.2; they are not reported as passes.

## Next authorized step

ROADMAP-0001 **STEP-05 / v0.0.5 — ChatGPT Tab Registry, Explicit Targeting and Browser Lifecycle**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. The bundled userscript is behavior/selector evidence only; product source owns the adapter and contains no remote userscript runtime dependency.
