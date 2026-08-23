# ChatGPT Iterator — v0.0.7

Chrome-native Side Panel controller for durable ChatGPT iteration workflows.

## Current status

ROADMAP-0001 STEP-07 is complete. Phase P2 remains active with durable execution authority now established independently from Repeat/Queue message sourcing.

The exact originally requested `chatgpt-iterator-v0.0.0` archive remains unavailable. The accepted v0.0.1 overlay and executable successors remain the authorized forward lineage; no byte-for-byte ancestry claim is fabricated.

## Implemented in v0.0.7

- Durable run state model: `ready`, `running`, `waiting_response`, `waiting_delay`, `paused`, `frozen`, `discarded`, `completed`, `failed`, `stopped`.
- UUID run identity plus monotonically advancing generation fences; stale asynchronous completions cannot mutate a newer generation.
- Atomic run snapshot + structured run-event persistence before runtime publication.
- Exact request replay/idempotency using request UUIDs as command fences.
- Pause/resume/stop semantics with preserved resumable active state.
- Worker recovery advances nonterminal generations so pre-restart work is fenced.
- Tab reconciliation maps frozen/discarded/recovered/closed target facts into durable run state without page polling.
- Bounded structured run-event payloads (4096 bytes) and 256 retained events per run with monotonic sequence numbers.
- Background runtime commands for create/start/pause/resume/stop/get/list.
- Side Panel connectivity is not run ownership; closing/reopening the panel cannot terminate a durable run.
- Repeat message sourcing, response orchestration, short-delay scheduling and automatic Continue remain STEP-08.

## Validation

- `npm run test:step07`: **8/8 PASS** using Node's TypeScript stripping lane.
- Dependency-free strict TypeScript check across core/persistence/tabs/ChatGPT types/runs/run runtime: **PASS** with TypeScript 5.8.3.
- STEP-06 persistence suite is the one narrow predecessor smoke for this iteration.
- WXT dependency hydration/prepare/full extension typecheck/build remain inherited **DEFERRED_ENVIRONMENT**; no dependency changed and that unavailable package lane was not retried.

## Next authorized step

ROADMAP-0001 **STEP-08 / v0.0.8 — Repeat Mode, Message Sources and Short-Delay Scheduler**.

## Reference inputs

`dumps/donors/` remains immutable read-only reference material. Runtime semantics in v0.0.7 are repository-owned and build directly on STEP-06 persistence plus STEP-05 tab lifecycle authority.
