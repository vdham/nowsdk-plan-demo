import type { Change } from '../model/change.js'
import type { Finding } from '../model/finding.js'

const RULE_ID = 'SN-ACL-004'
const CATEGORY = 'SECURITY_PRIVILEGE_EXPANSION'

function rolesOf(attrs: Record<string, unknown> | undefined): string[] {
  if (!attrs) return []
  const r = attrs['roles']
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []
}

// A role set becomes "less restrictive" if:
//   - the new set is empty while the old was not, OR
//   - the new set is a strict subset of the old set (roles removed and
//     none added).
export function isLessRestrictive(before: string[], after: string[]): boolean {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  if (beforeSet.size > 0 && afterSet.size === 0) return true
  const removed = [...beforeSet].some((r) => !afterSet.has(r))
  const added = [...afterSet].some((r) => !beforeSet.has(r))
  return removed && !added
}

export function evaluateAclPrivilegeExpansion(change: Change): Finding[] {
  if (change.resourceType !== 'acl') return []
  if (change.type !== 'MODIFY') return []
  const before = rolesOf(change.before?.attributes)
  const after = rolesOf(change.after?.attributes)
  if (!isLessRestrictive(before, after)) return []
  return [
    {
      ruleId: RULE_ID,
      severity: 'high',
      category: CATEGORY,
      resourceId: change.resourceId,
      message: `ACL roles: [${before.join(', ')}] -> [${after.join(', ')}]`,
    },
  ]
}
