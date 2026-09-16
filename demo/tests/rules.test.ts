import { describe, it, expect } from 'vitest'
import { evaluateAllRules } from '../src/rules/index.js'
import type { Change } from '../src/model/change.js'
import { isLessRestrictive } from '../src/rules/aclPrivilegeExpansion.js'

describe('SN-ACL-004 privilege expansion', () => {
  it('flags [x_helloworld.user] -> [] as HIGH', () => {
    const change: Change = {
      type: 'MODIFY',
      resourceId: 'acl:read',
      resourceType: 'acl',
      before: {
        id: 'acl:read',
        type: 'acl',
        name: 'read',
        attributes: { roles: ['x_helloworld.user'] },
      },
      after: {
        id: 'acl:read',
        type: 'acl',
        name: 'read',
        attributes: { roles: [] },
      },
    }
    const findings = evaluateAllRules({ changes: [change] })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.ruleId).toBe('SN-ACL-004')
    expect(findings[0]?.severity).toBe('high')
  })

  it('flags adding a role to a nonempty set (OR semantics broadens access)', () => {
    expect(isLessRestrictive(['a'], ['a', 'b'])).toBe(true)
  })

  it('does not flag removing a role without adding (narrows access)', () => {
    expect(isLessRestrictive(['a', 'b'], ['a'])).toBe(false)
  })

  it('does not flag going from empty to nonempty (previously ungated, now gated)', () => {
    expect(isLessRestrictive([], ['a'])).toBe(false)
  })

  it('flags mixed add+remove as broadening (role hierarchy is not modeled)', () => {
    // [user] -> [manager]: user loses access, manager gains it. Without
    // hierarchy modeling we can't tell if this is net broader or narrower;
    // flagging any-added is the safe default and lets a reviewer decide.
    expect(isLessRestrictive(['a'], ['b'])).toBe(true)
  })

  it('does not flag identical role sets', () => {
    expect(isLessRestrictive(['a', 'b'], ['a', 'b'])).toBe(false)
  })
})

describe('SN-TBL-002 destructive schema', () => {
  it('flags field DELETE as HIGH', () => {
    const change: Change = {
      type: 'DELETE',
      resourceId: 'field:x.y',
      resourceType: 'field',
      before: { id: 'field:x.y', type: 'field', name: 'y', attributes: {} },
    }
    const findings = evaluateAllRules({ changes: [change] })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.ruleId).toBe('SN-TBL-002')
    expect(findings[0]?.severity).toBe('high')
  })
})

describe('SN-BR-011 execution behavior', () => {
  it('flags when after -> before as MEDIUM', () => {
    const change: Change = {
      type: 'MODIFY',
      resourceId: 'br:x',
      resourceType: 'business_rule',
      before: {
        id: 'br:x',
        type: 'business_rule',
        name: 'x',
        attributes: { when: 'after' },
      },
      after: {
        id: 'br:x',
        type: 'business_rule',
        name: 'x',
        attributes: { when: 'before' },
      },
    }
    const findings = evaluateAllRules({ changes: [change] })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.ruleId).toBe('SN-BR-011')
    expect(findings[0]?.severity).toBe('medium')
  })

  it('does not flag before -> after', () => {
    const change: Change = {
      type: 'MODIFY',
      resourceId: 'br:x',
      resourceType: 'business_rule',
      before: {
        id: 'br:x',
        type: 'business_rule',
        name: 'x',
        attributes: { when: 'before' },
      },
      after: {
        id: 'br:x',
        type: 'business_rule',
        name: 'x',
        attributes: { when: 'after' },
      },
    }
    expect(evaluateAllRules({ changes: [change] })).toHaveLength(0)
  })
})
