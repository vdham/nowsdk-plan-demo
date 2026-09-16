# Prototype PRD: `now-sdk plan` Fixture-First Demo

**Purpose:** Build a working prototype for a 5-minute ServiceNow PM panel demo
**Implementation audience:** Claude Code
**Product:** Proposed `now-sdk plan`
**Prototype principle:** Demonstrate the UX, deterministic change/risk model, and stale-plan protection without claiming production parity with ServiceNow's installer.

## 1. Objective

Build a small TypeScript CLI prototype that demonstrates the proposed `now-sdk plan` workflow:

**build → plan → review/policy → verify approved plan**

The prototype should:

1. Use ServiceNow's official SDK Hello World sample as the application basis.
2. Represent a small target-instance fixture for that application.
3. Compare desired application metadata with target metadata.
4. Generate deterministic `CREATE / MODIFY / DELETE / NOOP` operations.
5. Generate deterministic risk findings from those operations.
6. Produce human-readable CLI and machine-readable JSON output.
7. Generate artifact, target-state, and change-set fingerprints.
8. Demonstrate a reviewed plan becoming stale and returning `REPLAN_REQUIRED`.
9. Perform no ServiceNow mutation.

This prototype validates the **product experience**, not production prediction fidelity.

Production `plan` would need to share ServiceNow's actual deployment-resolution semantics with `install`. That is a separate Alpha feasibility milestone.

---

# 2. Application Basis

Use the current official ServiceNow SDK examples repository:

```text
ServiceNow/sdk-examples
```

Use:

```text
hello-world-sample
```

as the starting application.

Before modifying anything:

1. Clone or inspect the current repository.
2. Build `hello-world-sample` successfully using its documented package-manager workflow.
3. Inspect its Fluent metadata.
4. Reuse its existing scope, IDs, tables, and project structure wherever practical.

Do not create an unrelated `x_acme_expense` application.

The demo should remain recognizable as a small ServiceNow Hello World / task-style application.

If the current Hello World sample does not contain all metadata types needed for the demo, add the minimum additional Fluent metadata to that sample.

---

# 3. Minimal Demo Domain

Keep the application extremely small.

The demo needs only enough metadata to demonstrate:

```text
CREATE
MODIFY
DELETE
security risk
execution-behavior risk
stale-plan detection
```

Target conceptual model:

```text
One application
One table
3–4 fields
One ACL
One Business Rule
```

Use the actual table/scope names from the checked-out Hello World sample rather than hard-coding names from this PRD.

For implementation code, expose those identities through configuration:

```ts
type DemoConfig = {
  appScope: string
  tableName: string
  fieldIds: {
    existingField: string
    deletedField: string
    newField: string
  }
  aclId: string
  businessRuleId: string
}
```

---

# 4. Demo Scenario

Create a target fixture representing the application's currently deployed state.

Then make the local desired version contain four changes:

### Change 1 — additive

Create a new field:

```text
priority
```

Expected:

```text
CREATE
no high-risk finding
```

### Change 2 — destructive

Remove an existing field from the desired application:

```text
deadline
```

Expected:

```text
DELETE
HIGH — DESTRUCTIVE_SCHEMA
```

### Change 3 — security broadening

Target ACL:

```text
read requires [todo_user]
```

Desired ACL:

```text
read requires []
```

Expected:

```text
MODIFY
HIGH — SECURITY_PRIVILEGE_EXPANSION
```

If the actual Hello World sample uses different roles/names, use those instead.

### Change 4 — execution behavior

Target Business Rule:

```text
when = after
```

Desired:

```text
when = before
```

Expected:

```text
MODIFY
MEDIUM — EXECUTION_BEHAVIOR
```

If the existing sample does not contain a suitable Business Rule, add one using the ServiceNow SDK Fluent `BusinessRule` API.

---

# 5. Architecture

Use this architecture:

```text
        Local Hello World application
                  |
                  v
        DesiredResourceAdapter
                  |
                  v
          normalized resources
                  |
                  +
                  |
          TargetAdapter
                  |
                  v
     relevantTargetResources
                  |
                  v
              Planner
                  |
          proposed ChangeSet
                  |
            +-----+------+
            |            |
            v            v
        RiskEngine   Fingerprinter
            |            |
            +------v-----+
                   |
                Plan
                   |
          console + JSON
```

Keep target acquisition separate from planning.

The planner must work identically whether target state comes from:

```text
fixture JSON
```

or later:

```text
now-sdk query / downloaded metadata
```

---

# 6. Normalized Resource Model

Do not diff arbitrary raw XML or TypeScript.

Normalize only the metadata needed by the demo.

```ts
type ResourceType =
  | 'field'
  | 'acl'
  | 'business_rule'

type Resource = {
  id: string
  type: ResourceType
  name: string
  attributes: Record<string, unknown>
}
```

Example:

```json
{
  "id": "acl:todo_read",
  "type": "acl",
  "name": "Todo read ACL",
  "attributes": {
    "operation": "read",
    "roles": ["todo_user"]
  }
}
```

Field example:

```json
{
  "id": "field:deadline",
  "type": "field",
  "name": "deadline",
  "attributes": {
    "type": "date"
  }
}
```

Business Rule example:

```json
{
  "id": "br:state_change",
  "type": "business_rule",
  "name": "State Change",
  "attributes": {
    "when": "after",
    "active": true
  }
}
```

Prefer stable ServiceNow metadata identity when available.

---

# 7. Desired Resources

Implement:

```ts
interface DesiredResourceAdapter {
  getResources(): Promise<Resource[]>
}
```

For P0, it is acceptable to derive normalized desired resources from a local JSON representation corresponding to the Hello World application's intended Fluent metadata.

Preferred progression:

```text
P0:
fixture/local normalized desired resources

P1:
derive from actual Hello World source/build artifacts where practical
```

The demo must not depend on successfully parsing every possible Fluent construct.

---

# 8. How to Determine Relevant Target Resources

Do **not** fingerprint the whole ServiceNow instance.

Define:

> `relevantTargetResources` = the minimum target metadata needed to determine this artifact's proposed changes and evaluate active deterministic risk rules.

For this prototype, derive relevance as follows.

### Step 1 — Start from desired resources

For every desired resource:

```text
field
ACL
Business Rule
```

collect its stable identity.

### Step 2 — Add explicitly deleted resources

Deletion cannot be inferred from “not present locally” in the general case.

For the prototype, keep an explicit deletion list:

```ts
const explicitDeletes: ResourceRef[] = [
  { id: 'field:deadline', type: 'field' }
]
```

### Step 3 — Add direct dependencies required by comparison

Examples:

```text
ACL → relevant roles
Business Rule → referenced table
field → owning table
```

Only model dependencies needed for the demo.

### Step 4 — Add data required by risk rules

For example:

`SN-ACL-004` needs the target ACL's current required-role set.

Therefore the target snapshot must contain:

```text
ACL current attributes
role requirement relationship
```

### Step 5 — Retrieve those resources

Conceptually:

```ts
const relevantRefs =
  union(
    desiredResourceRefs,
    explicitDeletes,
    directDependencies,
    ruleDataRequirements
  )

const relevantTargetResources =
  await targetAdapter.getResources(relevantRefs)
```

### Step 6 — Normalize and sort

Sort resources by stable ID before comparison and fingerprinting.

For the demo, do not build a generic ServiceNow dependency graph.

Hard-code relevance rules for:

```text
field
ACL
Business Rule
```

only.

---

# 9. Target Adapter

Define:

```ts
interface TargetAdapter {
  getResources(refs: ResourceRef[]): Promise<Resource[]>
}
```

Implement fixture mode first:

```ts
class FixtureTargetAdapter implements TargetAdapter
```

Input:

```text
fixtures/target-v1.json
```

Later, optionally implement:

```ts
class ServiceNowTargetAdapter implements TargetAdapter
```

using existing read-only SDK capabilities such as `now-sdk query` or downloaded application metadata.

Both adapters must return the same normalized `Resource[]` model.

---

# 10. Target Fixture V1

Create:

```text
fixtures/target-v1.json
```

It represents the application state before the proposed local changes.

Example shape:

```json
{
  "resources": [
    {
      "id": "field:deadline",
      "type": "field",
      "name": "deadline",
      "attributes": {
        "type": "date"
      }
    },
    {
      "id": "acl:todo_read",
      "type": "acl",
      "name": "Todo read ACL",
      "attributes": {
        "operation": "read",
        "roles": ["todo_user"]
      }
    },
    {
      "id": "br:state_change",
      "type": "business_rule",
      "name": "State Change",
      "attributes": {
        "when": "after",
        "active": true
      }
    }
  ]
}
```

Adapt names/IDs to the actual Hello World sample.

---

# 11. Target Fixture V2 — Simulated Concurrent Change

Create:

```text
fixtures/target-v2.json
```

Make exactly one deployment-relevant change after planning.

Preferred example:

```text
target-v1:
ACL roles = ["todo_user"]

target-v2:
ACL roles = ["todo_user", "todo_manager"]
```

Everything else remains unchanged.

This simulates another developer/admin changing relevant target metadata after the plan was reviewed.

---

# 12. Change Resolver

Implement deterministic comparison:

```ts
type ChangeType =
  | 'CREATE'
  | 'MODIFY'
  | 'DELETE'
  | 'NOOP'

type Change = {
  type: ChangeType
  resourceId: string
  resourceType: ResourceType
  before?: Resource
  after?: Resource
}
```

Rules:

```text
desired exists + target absent
→ CREATE

desired exists + target exists + relevant attributes differ
→ MODIFY

explicit deletion + target exists
→ DELETE

desired and target equivalent
→ NOOP
```

Do not assume:

```text
target exists + local missing = DELETE
```

unless the deletion is explicit.

This prevents accidental interpretation of unrelated or unmanaged metadata as deletion.

---

# 13. Prototype Limitation

The local resolver is a **demo approximation**.

Do not label it:

```text
ServiceNow deployment resolver
```

or claim:

```text
these are exactly the operations install will perform
```

Use:

> **Prototype expected change set derived from SDK-visible metadata.**

Production architecture requires `plan` and `install` to use shared ServiceNow deployment-resolution semantics.

---

# 14. Deterministic Risk Engine

Risk must be derived from the structured ChangeSet.

Do not call an LLM.

```text
ChangeSet
    |
    v
versioned deterministic rules
    |
    v
Findings
```

Implement these three rules.

## SN-ACL-004

**Security privilege expansion**

```text
IF:
resource.type == acl
AND required-role set becomes less restrictive

THEN:
severity = HIGH
category = SECURITY_PRIVILEGE_EXPANSION
```

Demo trigger:

```text
["todo_user"] → []
```

---

## SN-TBL-002

**Destructive schema**

```text
IF:
resource.type == field
AND change.type == DELETE

THEN:
severity = HIGH
category = DESTRUCTIVE_SCHEMA
```

---

## SN-BR-011

**Business Rule execution behavior**

```text
IF:
resource.type == business_rule
AND:
  after → before
  OR async → sync

THEN:
severity = MEDIUM
category = EXECUTION_BEHAVIOR
```

Finding model:

```ts
type Finding = {
  ruleId: string
  severity: 'low' | 'medium' | 'high'
  category: string
  resourceId: string
  message: string
}
```

For identical inputs and rule version, findings must be identical.

---

# 15. Fingerprints

Use SHA-256 over canonical JSON.

## Artifact digest

Represents the desired application state used by the plan.

```text
artifactDigest =
SHA256(canonical(desiredResources + explicitDeletes))
```

---

## Relevant target fingerprint

Represents only target state used to calculate the plan.

```text
targetFingerprint =
SHA256(canonical(relevantTargetResources))
```

Do not fingerprint:

```text
incidents
users
logs
unrelated application metadata
the whole ServiceNow instance
```

unless actually required by the plan.

---

## Change-set digest

Represents the exact proposed operation set.

```text
changeSetDigest =
SHA256(canonical(ChangeSet))
```

Canonicalization must:

```text
sort resources by ID
sort object keys
exclude timestamps
exclude volatile fields
normalize semantically unordered arrays
```

---

# 16. Plan Receipt

Generated `plan.json`:

```json
{
  "schemaVersion": "0.1-demo",
  "planId": "pl_001",
  "artifactDigest": "A123",
  "targetFingerprint": "T456",
  "rulesVersion": "demo-1",
  "changeSetDigest": "C999",
  "coverage": "COMPLETE",
  "summary": {
    "create": 1,
    "modify": 2,
    "delete": 1,
    "highestSeverity": "high"
  },
  "changes": [],
  "findings": []
}
```

Definitions:

```text
artifactDigest
= what desired application was reviewed

targetFingerprint
= what relevant target state it was reviewed against

changeSetDigest
= what proposed operations were reviewed
```

---

# 17. CLI

Implement:

```bash
sn-plan-demo plan
sn-plan-demo verify
```

## Plan

Example:

```bash
npm run plan -- \
  --target-fixture fixtures/target-v1.json \
  --out plan.json
```

Expected output:

```text
App: ServiceNow Hello World
Target: fixture/target-v1

+ 1 CREATE
~ 2 MODIFY
- 1 DELETE

Coverage: COMPLETE
Highest risk: HIGH

CREATE
  priority

HIGH  SN-TBL-002
  Delete field deadline

HIGH  SN-ACL-004
  Todo read ACL
  roles: [todo_user] -> []

MED   SN-BR-011
  State Change Business Rule
  when: after -> before

Plan: pl_001
```

---

# 18. Verify

Implement:

```bash
npm run verify -- \
  --plan plan.json \
  --target-fixture fixtures/target-v1.json
```

Expected:

```text
Plan valid.

artifact: PASS
target: PASS
change set: PASS

Status: READY
```

No mutation occurs.

Then run:

```bash
npm run verify -- \
  --plan plan.json \
  --target-fixture fixtures/target-v2.json
```

Expected:

```text
Plan validation failed.

Expected target fingerprint:
T456...

Current target fingerprint:
T777...

Status:
REPLAN_REQUIRED

No mutation performed.
```

---

# 19. Read-Only Guarantee

Every prototype operation must be non-mutating.

Allowed:

```text
now-sdk build
now-sdk query
now-sdk download
local file reads
local hashing
local diffing
writing plan.json
```

Do not execute:

```text
now-sdk install
```

during the panel demo.

The prototype demonstrates the proposed authorization boundary without modifying an instance.

---

# 20. Optional Live ServiceNow Adapter

This is P1, not required for the demo.

After fixture mode works, optionally implement target acquisition using:

```text
now-sdk query
```

or downloaded SDK metadata.

Possible mapping:

```text
field
→ sys_dictionary

ACL
→ sys_security_acl + required-role relationship

Business Rule
→ sys_script
```

The adapter must normalize live results into the exact same `Resource[]` format used by fixture mode.

Do not let live-instance integration delay the working demo.

---

# 21. Project Structure

Use:

```text
demo/
  src/
    cli.ts

    commands/
      plan.ts
      verify.ts

    adapters/
      desiredFixture.ts
      targetFixture.ts
      serviceNowTarget.ts       # optional P1

    model/
      resource.ts
      change.ts
      finding.ts
      plan.ts

    planner/
      relevance.ts
      diff.ts
      canonicalize.ts
      fingerprint.ts

    rules/
      index.ts
      aclPrivilegeExpansion.ts
      destructiveSchema.ts
      businessRuleExecution.ts

    output/
      console.ts
      json.ts

  fixtures/
    desired.json
    target-v1.json
    target-v2.json

  tests/

  README.md
```

Suggested stack:

```text
Node.js 20+
TypeScript
tsx
commander
Node crypto
Vitest
```

Minimize dependencies.

---

# 22. Acceptance Criteria

The prototype is complete when:

1. The official Hello World SDK sample builds successfully.
2. Fixture data maps to the actual sample's application/table identities.
3. `plan` produces deterministic `CREATE`, `MODIFY`, `DELETE`, and optional `NOOP`.
4. The demo shows:

   * one CREATE,
   * one DELETE,
   * one ACL MODIFY,
   * one Business Rule MODIFY.
5. Three deterministic risk rules produce expected findings.
6. No LLM participates in risk classification.
7. Human-readable and JSON outputs are generated.
8. Identical inputs produce identical fingerprints and findings.
9. `target-v1` validates the original plan.
10. `target-v2` returns `REPLAN_REQUIRED`.
11. No command mutates ServiceNow.
12. Fixture mode works offline.
13. Full presentation can be completed in under five minutes.

---

# 23. Tests

At minimum:

```text
CREATE detection
MODIFY detection
explicit DELETE detection
NOOP detection

ACL:
[todo_user] → []
=> HIGH

field DELETE
=> HIGH

Business Rule:
after → before
=> MEDIUM

same desired + same target
=> identical ChangeSet

same input reordered
=> identical fingerprints

relevant target change
=> different targetFingerprint

unrelated fixture ordering change
=> same targetFingerprint

target-v1 verify
=> READY

target-v2 verify
=> REPLAN_REQUIRED
```

Also test that a resource missing locally but **not explicitly deleted** is not automatically emitted as DELETE.

---

# 24. Five-Minute Demo Script

## 0:00–0:30 — Context

Show the ServiceNow Hello World SDK application.

Say:

> “I used ServiceNow's own minimal SDK sample so the prototype focuses on the deployment problem rather than an invented application.”

Then:

> “The question I want to answer before an agent mutates an instance is: what is this application expected to change on this target, and does that cross a known platform risk boundary?”

---

## 0:30–1:00 — Build

Run:

```bash
now-sdk build
```

Say:

> “Build tells me the application is internally valid. It does not tell me what installation will change on this target.”

---

## 1:00–2:30 — Plan

Run:

```bash
npm run plan -- \
  --target-fixture fixtures/target-v1.json \
  --out plan.json
```

Highlight:

```text
+ priority
- deadline

ACL:
[todo_user] → []

Business Rule:
after → before
```

Then highlight:

```text
HIGH security privilege expansion
HIGH destructive schema
MED execution behavior
```

Say:

> “These findings are derived from deterministic rules over structured metadata changes—not generated by an LLM.”

---

## 2:30–3:15 — Machine Contract

Open `plan.json`.

Highlight:

```text
artifactDigest
targetFingerprint
changeSetDigest
ruleId
coverage
```

Say:

> “The same output can be consumed by a human, CI pipeline, or coding agent.”

---

## 3:15–4:15 — Stale Plan

Explain that another administrator changes the ACL.

Run:

```bash
npm run verify -- \
  --plan plan.json \
  --target-fixture fixtures/target-v2.json
```

Show:

```text
REPLAN_REQUIRED
```

Say:

> “Fingerprinting doesn't determine the plan. It ensures that the relevant target state that was reviewed has not silently changed before execution.”

---

## 4:15–5:00 — Production Boundary

Say:

> “This prototype deliberately uses an SDK-visible metadata comparison to validate the experience, deterministic risk contract, and stale-plan model. My first production Alpha milestone would validate whether ServiceNow's install path already computes—or can be refactored to expose—a shared pre-persistence change representation. That shared resolver is what would give production `plan` prediction fidelity.”

Stop.

Do not perform a real install.

---

# 25. What the Prototype Proves

The prototype demonstrates:

```text
developer UX
agent-consumable JSON
target-aware comparison
deterministic risk rules
relevant-target fingerprinting
plan receipt semantics
stale-plan rejection
read-only safety
```

It does not prove:

```text
exact installer parity
full metadata coverage
transactional install behavior
runtime application correctness
complete dependency analysis
organizational approval workflows
```

Be explicit about this distinction.

---

# 26. Implementation Priority

## P0 — Build this first

1. Inspect/build official Hello World sample.
2. Define normalized `Resource`.
3. Create desired fixture.
4. Create `target-v1`.
5. Implement explicit deletes.
6. Implement relevance calculation.
7. Implement deterministic ChangeSet.
8. Implement three risk rules.
9. Implement fingerprints.
10. Implement CLI output.
11. Implement `plan.json`.
12. Implement `verify`.
13. Create `target-v2`.
14. Add tests.
15. Rehearse full 5-minute flow offline.

## P1 — Only after P0 works

16. Extract desired state more directly from actual SDK artifacts/source.
17. Implement `now-sdk query` target adapter.
18. Implement downloaded-metadata target adapter.
19. Add `--fail-on`.

## P2 — Do not prioritize for panel

20. More metadata types.
21. Custom rule authoring.
22. Human approvals.
23. Real `install --plan`.
24. LLM explanation/remediation.
25. UI/dashboard.

The most important requirement is a **deterministic, reliable, rehearsable five-minute demo**, not production completeness.
