import type { ChangeSet } from '../model/change.js'
import type { Finding } from '../model/finding.js'
import { evaluateAclPrivilegeExpansion } from './aclPrivilegeExpansion.js'
import { evaluateDestructiveSchema } from './destructiveSchema.js'
import { evaluateBusinessRuleExecution } from './businessRuleExecution.js'

const RULES = [
  evaluateAclPrivilegeExpansion,
  evaluateDestructiveSchema,
  evaluateBusinessRuleExecution,
]

export function evaluateAllRules(cs: ChangeSet): Finding[] {
  const findings: Finding[] = []
  for (const change of cs.changes) {
    for (const rule of RULES) {
      findings.push(...rule(change))
    }
  }
  findings.sort((a, b) => {
    if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1
    return a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0
  })
  return findings
}
