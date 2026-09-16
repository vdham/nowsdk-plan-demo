# sn-plan-demo

Prototype of the proposed `now-sdk plan` workflow.

Demonstrates the **prototype flow** (`build → plan → review →
verify-target-freshness`) against a Hello World SDK application forked
from `ServiceNow/sdk-examples/hello-world-sample`. The **proposed
production flow** is `build → plan → review → install --plan` — see
[`../README.md`](../README.md) *Terminology* for why production verify
lives inside install rather than as a separate command. Features:

- deterministic `CREATE / MODIFY / DELETE / NOOP` operations
- three deterministic risk rules (no LLM)
- artifact / relevant-target / change-set fingerprints
- stale-plan detection (`REPLAN_REQUIRED`)
- read-only: never mutates a ServiceNow instance
- `--fail-on <severity>` for CI gating (exit code 3)

See `../specs/PRD.md` for full spec.

## Quick start

```bash
npm install

# Plan from JSON fixture (fastest — no now-sdk needed)
npm run plan -- --target-fixture fixtures/target-v1.json --out plan.json

# Verify against the same target (READY)
npm run verify -- --plan plan.json --target-fixture fixtures/target-v1.json

# Verify against a drifted target (REPLAN_REQUIRED, exit 2)
npm run verify -- --plan plan.json --target-fixture fixtures/target-v2.json
```

## Desired-state source

Two sources for desired application state (`--desired-source`):

**`fixture`** (default): parse `fixtures/desired.json`. Fast, no
dependencies. Good for demoing and testing the planner.

**`sdk-build`**: parse `now-sdk build` XML output. Desired state comes
from the real Fluent source, but the parser only handles the metadata
types the demo needs — `sys_dictionary` (fields), `sys_security_acl`
(ACLs, without joining the `sys_security_acl_role` link table), and
`sys_script` (Business Rules). Other update-set records are ignored:

```bash
# One-shot: build the app, then plan
npm run plan:from-source -- --target-fixture fixtures/target-v1.json --out plan.json

# Or run the steps separately
npm run build:app
npm run plan -- \
  --desired-source sdk-build \
  --target-fixture fixtures/target-v1.json \
  --out plan.json
```

`app/plan-explicit-deletes.json` lists explicit deletions. The
prototype does not infer deletes from absence — production `plan`
would derive delete semantics from the SDK's install-time
representation (`now-sdk build --generate-deletes`, default `true`).
See PRD §8 step 2.

## The forked Hello World app (`app/`)

`app/` is a copy of `hello-world-sample` with:

- `priority` field added to the table (Change 1: CREATE)
- `datetime_field` removed from the table + listed in
  `plan-explicit-deletes.json` (Change 2: DELETE)
- `todo-read-acl.now.ts` — new ACL with no roles (Change 3: HIGH once
  target-v1's `x_helloworld.user` role is compared)
- `state-change-br.now.ts` — Business Rule with `when: 'before'`
  (Change 4: MEDIUM once target-v1's `when: 'after'` is compared)

## CI gating

```bash
npm run plan -- --target-fixture fixtures/target-v1.json --out plan.json --fail-on high
echo $?   # 3, because SN-ACL-004 and SN-TBL-002 are HIGH
```

## Identities

Scope `x_helloworld`, table `x_helloworld_tableone`. Field elements
`string_field`, `integer_field`, `priority` (unchanged from the sample
where applicable); `datetime_field` is the demo's DELETE target. The
ACL and Business Rule live only in the forked app; they were added
per PRD §3 since the upstream sample includes neither.
