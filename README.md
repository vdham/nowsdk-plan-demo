# now-sdk plan (prototype)

A prototype for a proposed `now-sdk plan` command that answers a
question ServiceNow's SDK doesn't answer today:

> *What will installing this application change on this target instance,
> and does any of it cross a known risk boundary?*

The prototype demonstrates the developer UX, a deterministic risk
contract, and stale-plan detection — all without mutating any
ServiceNow instance.

## What it does

A TypeScript CLI over the ServiceNow SDK Hello World sample. Given a
local application and a target-instance snapshot, it produces:

- A deterministic **change set** (`CREATE / MODIFY / DELETE / NOOP`)
- **Risk findings** from three versioned rules
  (`SN-ACL-004`, `SN-TBL-002`, `SN-BR-011`) — no LLM involved in
  classification
- Three **fingerprints** (SHA-256 over canonical JSON) capturing the
  reviewed artifact, target state, and proposed operations
- **Stale-plan detection** via `verify` — if the target drifted after
  review, returns `REPLAN_REQUIRED` with a distinct exit code

An optional `--explain` layer calls Claude Opus 4.7 **after** the
deterministic engine to annotate each finding with plain-English
context. The LLM cannot change severity, add findings, or trigger
rules — verified by test.

## Quick start

```bash
cd demo
npm install

# Plan the local app against a target-instance fixture
npm run plan -- --target-fixture fixtures/target-v1.json --out plan.json

# Verify the plan against the same target (READY)
npm run verify -- --plan plan.json --target-fixture fixtures/target-v1.json

# Same plan against a drifted target (REPLAN_REQUIRED, exit 2)
npm run verify -- --plan plan.json --target-fixture fixtures/target-v2.json
```

Optional variants:

```bash
# Pull desired state from real `now-sdk build` XML output instead of fixture
npm run plan:from-source -- --target-fixture fixtures/target-v1.json --out plan.json

# CI gate: exit 3 if any finding meets the threshold
npm run plan -- --target-fixture fixtures/target-v1.json --out plan.json --fail-on high

# LLM annotations (requires ANTHROPIC_API_KEY)
npm run plan:explain -- --target-fixture fixtures/target-v1.json --out plan.json
```

Exit codes: `0` OK · `1` runtime error · `2` `REPLAN_REQUIRED` · `3` `--fail-on` threshold met.

## Reading order

| If you want to... | Read |
|---|---|
| Understand the pitch / problem framing | [`specs/PRD.md`](specs/PRD.md) |
| See milestone status and what's built | [`STATUS.md`](STATUS.md) |
| Read the code | [`demo/README.md`](demo/README.md), then [`demo/src/`](demo/src/) |

## Design principles

1. **Deterministic risk decisions.** Severity comes from versioned code
   rules, never from a model. Same inputs → same findings.
2. **Read-only.** No command in this prototype mutates a ServiceNow
   instance. Adapters that would talk to a live instance are scaffolded
   with honest "not implemented" errors, never silent no-ops.
3. **Explicit deletes.** A resource absent from the desired state is
   *never* interpreted as DELETE. Deletion must be explicitly declared.
   Prevents the prototype from dropping unmanaged metadata.
4. **Machine-consumable plan receipts.** The `plan.json` schema (rule
   IDs, digests, `relevantRefs`) is designed so a human, CI pipeline,
   or coding agent can consume identical output.
5. **Additive LLM layer.** `--explain` annotations attach to findings
   but are excluded from every fingerprint — verified by test. The
   deterministic contract remains byte-identical whether or not the
   LLM is invoked.

## Deliberate scope

The prototype is a **demo approximation** — it compares SDK-visible
metadata, which is not the same as what ServiceNow's `install` path
would actually do. This is a scoping choice, not a limitation to hide:

- The interface, receipt shape, and stale-plan gate are exercised
  end-to-end and testable today.
- The pre-persistence resolver that would give production `plan`
  installer parity is deliberately out of scope — that question is
  the strategic ask, not the prototype's answer.

See [`specs/PRD.md`](specs/PRD.md) §13 and §25 for the boundary and
[`STATUS.md`](STATUS.md) for what's built vs. deferred.

## Repository layout

```
.
├── README.md                    ← this file
├── STATUS.md                    ← milestone rollup
├── specs/PRD.md                 ← full requirements + demo script
└── demo/                        ← the prototype
    ├── app/                     ← forked ServiceNow Hello World SDK app
    ├── src/                     ← CLI, adapters, planner, rules, explain
    ├── fixtures/                ← desired + target v1/v2 JSON
    └── tests/                   ← 36 tests
```

## Status

- **P0** — fixture-first prototype: ✅ complete, all 13 PRD §22 acceptance criteria met
- **P1** — SDK-source desired adapter, `--fail-on`, live-target scaffolds: ✅ complete (adapter scaffolds pending an instance)
- **P2 #24** — LLM annotation layer: ✅ complete
- **Remaining P2** (more metadata types, custom rules, human approvals, real `install --plan`, UI): not started

Full milestone detail in [`STATUS.md`](STATUS.md).
