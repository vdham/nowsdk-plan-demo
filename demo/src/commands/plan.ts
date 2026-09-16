import { DesiredFixtureAdapter, type DesiredResourceAdapter } from '../adapters/desiredFixture.js'
import { SdkBuildDesiredAdapter } from '../adapters/sdkBuildDesired.js'
import { FixtureTargetAdapter } from '../adapters/targetFixture.js'
import { enrichFindings, AnthropicExplanationClient, type ExplanationClient } from '../explain/index.js'
import { computeRelevantRefs } from '../planner/relevance.js'
import { resolveChanges } from '../planner/diff.js'
import {
  artifactDigest,
  targetFingerprint,
  changeSetDigest,
} from '../planner/fingerprint.js'
import { evaluateAllRules } from '../rules/index.js'
import { highestSeverity } from '../model/finding.js'
import { RESOLVER_VERSION, RULES_VERSION, SCHEMA_VERSION, type PlanReceipt } from '../model/plan.js'
import { renderPlanConsole } from '../output/console.js'
import { writePlanJson } from '../output/json.js'

export type DesiredSource =
  | { kind: 'fixture'; path: string }
  | { kind: 'sdk-build'; buildDir: string; explicitDeletesPath: string }

export type PlanOptions = {
  desired: DesiredSource
  targetFixture: string
  out: string
  appLabel?: string
  // Optional LLM enrichment. When set, findings gain plain-English
  // explanations, blast-radius notes, and remediation steps. The
  // deterministic engine still decides severity — the LLM only
  // annotates. Requires ANTHROPIC_API_KEY.
  explainClient?: ExplanationClient
}

function makeDesiredAdapter(src: DesiredSource): DesiredResourceAdapter {
  if (src.kind === 'fixture') return new DesiredFixtureAdapter(src.path)
  return new SdkBuildDesiredAdapter(src.buildDir, src.explicitDeletesPath)
}

export async function runPlan(opts: PlanOptions): Promise<PlanReceipt> {
  const desiredAdapter = makeDesiredAdapter(opts.desired)
  const targetAdapter = new FixtureTargetAdapter(opts.targetFixture)

  const desired = await desiredAdapter.getResources()
  const explicitDeletes = await desiredAdapter.getExplicitDeletes()

  const relevantRefs = computeRelevantRefs(desired, explicitDeletes)
  const target = await targetAdapter.getResources(relevantRefs)

  const changeSet = resolveChanges(desired, target, explicitDeletes)
  let findings = evaluateAllRules(changeSet)
  if (opts.explainClient && findings.length > 0) {
    findings = await enrichFindings(findings, changeSet, opts.explainClient)
  }

  const aDigest = artifactDigest(desired, explicitDeletes)
  const tFp = targetFingerprint(target)
  const csDigest = changeSetDigest(changeSet)

  const summary = {
    create: changeSet.changes.filter((c) => c.type === 'CREATE').length,
    modify: changeSet.changes.filter((c) => c.type === 'MODIFY').length,
    delete: changeSet.changes.filter((c) => c.type === 'DELETE').length,
    highestSeverity: highestSeverity(findings),
  }

  const plan: PlanReceipt = {
    schemaVersion: SCHEMA_VERSION,
    planId: `pl_${csDigest.slice(0, 6)}`,
    artifactDigest: aDigest,
    targetFingerprint: tFp,
    rulesVersion: RULES_VERSION,
    changeSetDigest: csDigest,
    resolverVersion: RESOLVER_VERSION,
    // COMPLETE is safe for fixture mode because a fixture is definitionally
    // the whole snapshot the reviewer approved against. A live target
    // adapter that could not retrieve every relevantRef (network partial,
    // permission denied on some resource, pagination cutoff) MUST emit
    // 'INCOMPLETE' — per PRD §16, INCOMPLETE != SAFE. Consumers must
    // refuse to gate on an INCOMPLETE plan.
    coverage: 'COMPLETE',
    summary,
    relevantRefs: relevantRefs,
    changes: changeSet.changes.filter((c) => c.type !== 'NOOP'),
    findings,
  }

  await writePlanJson(opts.out, plan)

  const console_ = renderPlanConsole(plan, {
    appLabel: opts.appLabel ?? 'ServiceNow Hello World',
    targetLabel: opts.targetFixture,
  })
  process.stdout.write(console_ + '\n')

  return plan
}
