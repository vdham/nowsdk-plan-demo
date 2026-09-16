import type { Change } from '../model/change.js'
import type { Finding } from '../model/finding.js'

const RULE_ID = 'SN-ACL-004'
const CATEGORY = 'SECURITY_PRIVILEGE_EXPANSION'

function rolesOf(attrs: Record<string, unknown> | undefined): string[] {
  if (!attrs) return []
  const r = attrs['roles']
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []
}

// ServiceNow ACL role lists use OR semantics: holding ANY listed role
// satisfies the role condition. Under those semantics, an ACL becomes
// less restrictive when:
//
//   - a nonempty role requirement becomes empty (role requirement
//     removed entirely — access is no longer role-gated), OR
//   - any new role is added to the set (a new group of users can now
//     pass the check).
//
// Removing roles without adding NARROWS access (fewer roles satisfy
// the OR); we do not flag it. Similarly, going from empty to a
// nonempty set is a NARROWING change (previously ungated, now gated).
//
// Mixed add/remove (e.g. [user] -> [manager]) is flagged as broadening
// on the "any added" branch, because without modeling ServiceNow's
// role hierarchy we cannot tell whether the new role is broader or
// narrower than the removed one. Flagging for review is the safe
// default; if a customer wants more nuance, that's rule authorship
// territory (P2 #21).
export function isLessRestrictive(before: string[], after: string[]): boolean {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  // Empty -> any nonempty: previously unrestricted, now restricted — narrower.
  if (beforeSet.size === 0 && afterSet.size > 0) return false
  // Nonempty -> empty: role requirement removed — broader.
  if (beforeSet.size > 0 && afterSet.size === 0) return true
  // Any new role added: OR semantics broaden — more users can pass.
  return [...afterSet].some((r) => !beforeSet.has(r))
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
