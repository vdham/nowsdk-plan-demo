# Project Status

**Last updated:** 2026-09-16
**Prototype:** `now-sdk plan` fixture-first demo — see [specs/PRD.md](specs/PRD.md)

## Overview

TypeScript CLI prototype demonstrating the **prototype workflow**:

```
build → plan → review/policy → verify-target-freshness
```

The **proposed production workflow** is different — freshness lives
inside install to avoid a TOCTOU gap:

```
build → plan → review/policy → install --plan
```

The prototype compares a local Hello World application against a
target-instance fixture, produces deterministic `CREATE/MODIFY/DELETE/NOOP`
operations, evaluates three deterministic risk rules, emits fingerprinted
plan receipts, and demonstrates stale-plan detection via
`REPLAN_REQUIRED`. See [`specs/PRD.md`](specs/PRD.md) §1 for the full
prototype-vs-production framing.

**No LLM in the risk decision. No ServiceNow mutation. Read-only.**
(Optional post-decision LLM annotation via `--explain` — see P2 #24 below.)

## Milestone status

| Milestone | Status | Notes |
|-----------|--------|-------|
| **P0** — fixture-first prototype | ✅ Complete | Meets all 13 PRD §22 acceptance criteria |
| **P1 #16** — desired from SDK source | ✅ Complete | Parses real `now-sdk build` XML output |
| **P1 #17** — live `now-sdk query` target | 🟡 Scaffold-only | Interface + config-from-env; wiring deferred (no instance) |
| **P1 #18** — downloaded-metadata target | 🟡 Scaffold-only | Class + shape reused from build adapter; needs instance to end-to-end |
| **P1 #19** — `--fail-on` severity gate | ✅ Complete | Exit code 3 when threshold met |
| **P2 #24** — LLM explanation / remediation | ✅ Complete | Opt-in via `--explain`; Opus 4.7; deterministic engine unchanged |
| **P2 #20–23, #25** — other P2 items | Not started | See PRD §26 |

## What's built

### Architecture (`demo/`)

```
demo/
├── app/                            # forked Hello World SDK app
│   ├── src/fluent/
│   │   ├── sample-table.now.ts     # +priority, -datetime_field
│   │   ├── sample-table-record.now.ts
│   │   ├── todo-read-acl.now.ts    # NEW: ACL, no roles
│   │   ├── state-change-br.now.ts  # NEW: BR, when='before'
│   │   └── state-change-br.server.js
│   ├── plan-explicit-deletes.json  # datetime_field
│   ├── now.config.json             # scope: x_helloworld
│   └── package.json                # @servicenow/sdk@4.12.0
│
├── src/
│   ├── cli.ts                      # commander entry
│   ├── commands/
│   │   ├── plan.ts                 # supports fixture + sdk-build source
│   │   └── verify.ts               # READY | REPLAN_REQUIRED
│   ├── adapters/
│   │   ├── desiredFixture.ts       # P0: JSON fixture
│   │   ├── sdkBuildDesired.ts      # P1: parses dist/app/update/*.xml
│   │   ├── targetFixture.ts        # P0: JSON fixture
│   │   ├── downloadedMetadataTarget.ts  # P1 scaffold
│   │   └── serviceNowTarget.ts     # P1 scaffold (env config)
│   ├── model/                      # Resource, Change, Finding, PlanReceipt
│   ├── planner/                    # canonicalize, fingerprint, diff, relevance
│   ├── rules/                      # SN-ACL-004, SN-TBL-002, SN-BR-011
│   ├── explain/                    # P2: Anthropic client + finding enrichment
│   └── output/                     # console renderer, plan.json writer
│
├── fixtures/
│   ├── desired.json                # P0 desired state
│   ├── target-v1.json              # baseline instance
│   └── target-v2.json              # v1 + one ACL role added (drift)
│
└── tests/                          # 40 tests, all passing
```

### Deterministic risk rules

- **SN-ACL-004** (HIGH) — security privilege expansion when role set
  becomes strictly less restrictive (or empties)
- **SN-TBL-002** (HIGH) — destructive schema (field DELETE)
- **SN-BR-011** (MEDIUM) — Business Rule execution behavior:
  `when: after → before` or `execution: async → sync`

### Fingerprints (SHA-256 over canonical JSON)

- `artifactDigest` — desired resources + explicit deletes
- `targetFingerprint` — the reviewed target state (only relevant refs,
  not the whole instance)
- `changeSetDigest` — the proposed operations

Canonical JSON sorts object keys; ACL roles are pre-sorted at resource
level because set-semantics is a property of ACLs, not of serialization.

### Desired-state sources

| Source | Command | What it does |
|--------|---------|--------------|
| `fixture` (default) | `npm run plan -- --target-fixture ...` | Parses `fixtures/desired.json` |
| `sdk-build` | `npm run plan:from-source -- --target-fixture ...` | Runs `now-sdk build` in `app/`, parses `dist/app/update/*.xml` |

Both produce the same `Resource[]` shape. Same plan comes out either
way (id conventions match).

### CLI

```bash
npm run plan -- --target-fixture fixtures/target-v1.json --out plan.json
npm run plan -- --target-fixture fixtures/target-v1.json --out plan.json --fail-on high
npm run plan:from-source -- --target-fixture fixtures/target-v1.json --out plan.json
npm run plan:explain -- --target-fixture fixtures/target-v1.json --out plan.json  # requires ANTHROPIC_API_KEY
npm run verify -- --plan plan.json --target-fixture fixtures/target-v1.json
npm run verify -- --plan plan.json --target-fixture fixtures/target-v2.json  # REPLAN_REQUIRED
```

Exit codes: `0` OK · `1` runtime error · `2` REPLAN_REQUIRED · `3` `--fail-on` threshold met.

### LLM explanation layer (P2 #24)

`--explain` (or `npm run plan:explain`) calls Claude Opus 4.7 **after**
the deterministic risk engine to annotate each finding with plain-English
`{explanation, blastRadius, remediation}`. The LLM:

- **Cannot** trigger rules, add findings, or change severity — those
  are code-decided
- Uses `output_config.format` + JSON schema for guaranteed-shape output
  (no free-form parsing)
- System prompt is marked `cache_control: ephemeral` so prompt-cache
  hits accrue across findings in a plan
- Additive-only: verified by test that `artifactDigest`,
  `targetFingerprint`, `changeSetDigest`, `planId`, `summary`, and
  `changes` are byte-identical whether `--explain` is set or not
- Model override via `ANTHROPIC_EXPLAIN_MODEL` env var (Sonnet 4.6 /
  Haiku 4.5 are cheaper alternatives)

### Test coverage (40 tests)

- `diff.test.ts` — CREATE / MODIFY / DELETE (explicit only) / NOOP + reordering stability
- `rules.test.ts` — each of 3 rules; negative cases
- `fingerprint.test.ts` — determinism under key/array reordering; ACL role set-semantics
- `verify.test.ts` — end-to-end plan+verify against v1 (READY) and v2 (REPLAN_REQUIRED)
- `failOn.test.ts` — CLI exit codes with `--fail-on`
- `sdkBuildDesired.test.ts` — XML parsing + full flow via SDK build path (skips if `app/dist/` absent)
- `liveAdapters.test.ts` — scaffold contract for ServiceNow + downloaded-metadata adapters
- `explain.test.ts` — mocked LLM enrichment; verifies fingerprints/summary/changes are unchanged by `--explain` (additive-only invariant)

## Design decisions worth remembering

1. **`relevantRefs` embedded in `plan.json`** — verify must recompute
   the target fingerprint over the exact same ref set the plan
   reviewed, otherwise NOOP resources drop out and fingerprints diverge
   spuriously. Not in the PRD's example schema; added as a fidelity fix.
2. **ACL role set-semantics on the resource, not in the canonicalizer.**
   Cleaner separation: "roles are unordered" is a fact about ACLs, not
   about JSON serialization.
3. **DELETE requires explicit refs.** A resource absent locally is
   NEVER interpreted as DELETE. Tested. Prevents accidental drop of
   unmanaged metadata.
4. **Forked Hello World app in `demo/app/`.** Kept scope, table, and
   field identities intact from the upstream sample; added only what
   the demo needs (per PRD §3). Owned by this repo, buildable offline.
5. **Live adapters are scaffold-only** with helpful "not implemented"
   error paths — deliberately no silent no-op. Wiring waits for an
   instance to validate against.
6. **LLM sits AFTER the deterministic engine.** `--explain` annotates
   findings that the code already produced; it cannot fire rules,
   change severity, or add findings. Explanations are excluded from
   every fingerprint. This preserves the PRD's "no LLM in the risk
   decision" contract while still surfacing model reasoning to
   reviewers who want it.

## What's next

- **Wire `ServiceNowTargetAdapter`** when instance credentials are
  available. Config plumbing is already env-driven.
- **Parse `sys_security_acl_role_*.xml`** if the demo ever needs a
  desired ACL with roles (currently the desired ACL is intentionally
  empty).
- **Remaining P2 items** from PRD §26: more metadata types, custom
  rule authoring, human approvals, real `install --plan`, UI/dashboard.
  (P2 #24 LLM explanation is done.) None prioritized for the panel
  demo.

## Reference clone

`sdk-examples/` (gitignored) is a shallow clone of
`ServiceNow/sdk-examples` used to inspect real Fluent samples. Not
part of our source tree. Delete freely; re-clone if inspecting
sibling samples again.
