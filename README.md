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

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | `node --version` to check |
| npm | 10+ (ships with Node 20) | |
| git | any recent | |
| `ANTHROPIC_API_KEY` | — | Optional. Only needed for `--explain` / `plan:explain`. Get one at [console.anthropic.com](https://console.anthropic.com) → API Keys. |

No ServiceNow instance is required — the core flow runs entirely
offline against JSON fixtures.

## Terminology

Three names to keep straight:

- **`now-sdk plan` / `now-sdk verify`** — the *proposed* commands this
  prototype is pitching. They **do not exist** in the real ServiceNow
  SDK today (v4.12.0 ships `auth`, `init`, `download`, `build`,
  `install`, `dependencies`, `transform`, `clean`, `pack`, `explain`,
  `query`, `cicd` — no `plan`, no `verify`).
- **`sn-plan-demo`** — the standalone binary in this repo that
  demonstrates what the proposed `now-sdk plan` / `now-sdk verify`
  would do. Independent from `now-sdk`; runs offline against fixtures
  and read-only SDK output.
- **`npm run plan`, `npm run verify`, `npm run plan:explain`, etc.**
  — local-development shortcuts that invoke `sn-plan-demo` via `tsx`.
  Used throughout this README because they work immediately after
  `npm install` without a global-install step.

`npm run plan` and `sn-plan-demo plan` execute identical code — see
`bin` and `scripts` in [`demo/package.json`](demo/package.json).
The only real `now-sdk` command this prototype actually invokes is
`now-sdk build`, when you use `--desired-source sdk-build`.

## The demo scenario

Two fixtures under [`demo/fixtures/`](demo/fixtures/) model the state
of a hypothetical ServiceNow instance:

- **`target-v1.json`** — the target as it looked when you generated
  the plan. Contains a `datetime_field`, an ACL requiring the
  `x_helloworld.user` role, and a Business Rule with `when: "after"`.
- **`target-v2.json`** — same instance, but *after* another admin
  granted `x_helloworld.manager` to the ACL. Simulates target drift
  between review and execution.

The local application (either from
[`demo/fixtures/desired.json`](demo/fixtures/desired.json) or from
`now-sdk build`) intends four changes: add `priority` field, delete
`datetime_field`, empty the ACL role list, flip the Business Rule to
`when: "before"`. That produces the demo's three risk findings.

## Quick start

```bash
cd demo
npm install

# Plan the local app against the "as-reviewed" target
npm run plan -- --target-fixture fixtures/target-v1.json --out plan.json
```

> **Cleaner CLI for presentations:** run `npm link` once from `demo/`
> to expose the binary in your `PATH`. Then you can use
> `sn-plan-demo plan --target-fixture ...` (no `npm run --` prefix,
> no `tsx` noise in the output). Undo with `npm unlink -g sn-plan-demo`.

Expected output:

```
App: ServiceNow Hello World
Target: fixtures/target-v1.json

+ 1 CREATE
~ 2 MODIFY
- 1 DELETE

Coverage: COMPLETE
Highest risk: HIGH

CREATE
  priority

HIGH  SN-ACL-004
  ACL roles: [x_helloworld.user] -> []

MED   SN-BR-011
  when: after -> before

HIGH  SN-TBL-002
  Delete field datetime_field

Plan: pl_51ac2e
```

Then:

```bash
# Verify against the same target — target hasn't drifted, plan is fresh
npm run verify -- --plan plan.json --target-fixture fixtures/target-v1.json
# → Status: READY, exit 0

# Verify against the drifted target — the "another admin changed it" case
npm run verify -- --plan plan.json --target-fixture fixtures/target-v2.json
# → Status: REPLAN_REQUIRED, exit 2
```

To see the machine-consumable receipt:

```bash
cat plan.json | head -40
# artifactDigest, targetFingerprint, changeSetDigest, rulesVersion,
# coverage, summary, relevantRefs, changes, findings
```

Exit codes: `0` OK · `1` runtime error · `2` `REPLAN_REQUIRED` · `3` `--fail-on` threshold met.

## Verifying your setup

```bash
cd demo
npm test        # 36 tests; ~4 seconds
npm run typecheck
```

If both pass, everything works.

## Optional variants

### Pull desired state from real `now-sdk build` XML output

This uses the *actual* Hello World SDK application (forked into
[`demo/app/`](demo/app/)) as the source of desired resources, parsing
the XML that `now-sdk build` emits. Two-step setup the first time:

```bash
cd demo
npm --prefix app install         # install the app's own devDependencies (@servicenow/sdk)
npm run build:app                # run `now-sdk build` in app/, emits dist/app/update/*.xml
npm run plan:from-source -- --target-fixture fixtures/target-v1.json --out plan.json
```

Produces an identical plan (same 3 findings, same operation counts) to
the fixture path — because both adapters normalize into the same
`Resource[]` shape.

### CI gate — fail the build on HIGH findings

```bash
npm run plan -- --target-fixture fixtures/target-v1.json --out plan.json --fail-on high
echo $?          # 3, because SN-ACL-004 and SN-TBL-002 are HIGH
```

Exit 3 is distinct from exit 2 (`REPLAN_REQUIRED`), so a CI pipeline
can gate on both differently.

### LLM annotations (`--explain`)

Requires `ANTHROPIC_API_KEY`. Layers a Claude Opus 4.7 call *after*
the deterministic engine to annotate each finding with a plain-English
explanation, blast-radius note, and remediation steps.

```bash
export ANTHROPIC_API_KEY="sk-ant-..."      # or put in your shell profile
npm run plan:explain -- --target-fixture fixtures/target-v1.json --out plan.json
```

Cost per plan: ~$0.05–$0.20 (3 findings, ~1K in + 1K out on Opus 4.7).
Override the model to save cost:

```bash
ANTHROPIC_EXPLAIN_MODEL=claude-haiku-4-5 npm run plan:explain -- ...
```

The LLM **cannot** trigger rules, add findings, or change severity —
its output is `Finding.explanation` only, and it's excluded from every
fingerprint. Verified by [`demo/tests/explain.test.ts`](demo/tests/explain.test.ts).

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
