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

  it('does not flag adding roles', () => {
    expect(isLessRestrictive(['a'], ['a', 'b'])).toBe(false)
  })

  it('does not flag swapping roles', () => {
    expect(isLessRestrictive(['a'], ['b'])).toBe(false)
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
