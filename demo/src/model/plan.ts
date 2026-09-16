import type { Change } from './change.js'
import type { Finding, Severity } from './finding.js'
import type { ResourceRef } from './resource.js'

export const SCHEMA_VERSION = '0.1-demo'
export const RULES_VERSION = 'demo-1'
// Identifies which deployment-resolver semantics produced the change
// set. Same artifact + same target + different resolver => potentially
// different change set. Reviewed plans must be re-planned if the
// resolver bumps, even when nothing else changed. In this prototype
// the "resolver" is our local SDK-visible metadata comparator; in
// production it would be whatever install-time resolver `now-sdk
// install --plan` shares with `plan`.
export const RESOLVER_VERSION = 'demo-1'

export type PlanSummary = {
  create: number
  modify: number
  delete: number
  highestSeverity: Severity | 'none'
}

export type PlanReceipt = {
  schemaVersion: string
  planId: string
  artifactDigest: string
  targetFingerprint: string
  rulesVersion: string
  resolverVersion: string
  changeSetDigest: string
  coverage: 'COMPLETE' | 'INCOMPLETE'
  summary: PlanSummary
  // The exact set of target refs the plan was reviewed against. Verify
  // must recompute targetFingerprint over these same refs — otherwise
  // NOOP resources drop out and fingerprints diverge spuriously.
  relevantRefs: ResourceRef[]
  changes: Change[]
  findings: Finding[]
}

export function validatePlanReceipt(x: unknown): asserts x is PlanReceipt {
  if (!x || typeof x !== 'object') {
    throw new Error('plan.json: not an object')
  }
  const required = [
    'schemaVersion',
    'planId',
    'artifactDigest',
    'targetFingerprint',
    'rulesVersion',
    'resolverVersion',
    'changeSetDigest',
    'coverage',
    'summary',
    'relevantRefs',
    'changes',
    'findings',
  ] as const
  for (const key of required) {
    if (!(key in x)) {
      throw new Error(`plan.json: missing field "${key}"`)
    }
  }
}
