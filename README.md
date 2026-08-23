# ChatGPT Iterator — v0.0.8

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-08 is complete and **Phase P2 is closed**. The project now has durable persistence, recoverable run authority and a working Repeat execution engine independent from Side Panel liveness.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.8

- Repository-owned `MessageSource` abstraction with Repeat as the first source.
- Bounded message placeholders: `{iteration}`, `{total}`, `{remaining}`, `{timestamp}`.
- Durable Repeat configuration/progress embedded in run state: total/completed/active iteration, active message, baseline signature, delay and `nextDueAt`.
- Event-driven execution sequence: wait idle → persist prepared iteration → send → wait response activity/stability → optional Continue → persist delay → next iteration.
- Empty-draft safety remains enforced before send.
- Expected assistant-baseline checks prevent dispatch against a conversation that changed between readiness inspection and click.
- Conservative worker recovery: a prepared `waiting_response` resumes observation and never blindly re-sends the active message.
- 5–29 second persisted delays use service-worker `setTimeout`; >=30 second and recovered coarse delays use `chrome.alarms`.
- Automatic Continue uses the semantic ChatGPT adapter capability.
- Response timing remains event/deadline driven; no 400ms page/service-worker polling loop was introduced.
- Background runtime start/resume activates execution; pause/stop cancel scheduled/observed work without making Side Panel lifetime authoritative.
- Added only the `alarms` Chrome permission required by coarse scheduling.

## Validation

- `npm run test:step08`: **9/9 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check across core/persistence/tabs/ChatGPT/messages/runs/runtime: **PASS** with TypeScript 5.8.3.
- STEP-07 durable-run suite is the one narrow predecessor smoke: **8/8 PASS**.
- WXT dependency hydration/prepare/full extension typecheck/build remain inherited **DEFERRED_ENVIRONMENT**; no dependency changed and that unavailable package lane was not retried.

## Next authorized step

ROADMAP-0001 **STEP-09 / v0.0.9 — Run Workspace and Five-Tab Product Shell**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. Runtime semantics in v0.0.8 are repository-owned and preserve the verified userscript safety semantics behind the STEP-04 ChatGPT adapter boundary.
