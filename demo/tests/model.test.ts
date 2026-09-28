import { describe, it, expect } from 'vitest'
import { validatePlanReceipt, SCHEMA_VERSION, RULES_VERSION, RESOLVER_VERSION } from '../src/model/plan.js'
import { normalizeResource } from '../src/model/resource.js'
import { highestSeverity } from '../src/model/finding.js'

describe('validatePlanReceipt', () => {
  it('throws on a non-object payload', () => {
    expect(() => validatePlanReceipt(null)).toThrow(/not an object/)
    expect(() => validatePlanReceipt('nope')).toThrow(/not an object/)
    expect(() => validatePlanReceipt(42)).toThrow(/not an object/)
  })

  it('names the first missing required field', () => {
    expect(() => validatePlanReceipt({})).toThrow(/missing field "schemaVersion"/)
  })

  it('passes a fully-formed receipt', () => {
    const ok = {
      schemaVersion: SCHEMA_VERSION,
      planId: 'pl_x',
      artifactDigest: 'a',
      targetFingerprint: 't',
      rulesVersion: RULES_VERSION,
      resolverVersion: RESOLVER_VERSION,
      changeSetDigest: 'cs',
      coverage: 'COMPLETE',
      summary: { create: 0, modify: 0, delete: 0, highestSeverity: 'none' },
      relevantRefs: [],
      changes: [],
      findings: [],
    }
    expect(() => validatePlanReceipt(ok)).not.toThrow()
  })
})

describe('normalizeResource', () => {
  it('leaves non-acl resources alone', () => {
    const f = { id: 'field:x.y', type: 'field' as const, name: 'y', attributes: { x: 1 } }
    expect(normalizeResource(f)).toBe(f)
  })

  it('returns the ACL unchanged when roles is not an array', () => {
    // Defensive fallback: if a fixture author or upstream adapter
    // hands us a malformed ACL, we should still round-trip it rather
    // than throw. Diffing will treat it as-is.
    const acl = {
      id: 'acl:x_read',
      type: 'acl' as const,
      name: 'x read',
      attributes: { roles: 'not-an-array' as unknown as string[] },
    }
    expect(normalizeResource(acl)).toBe(acl)
  })

  it('sorts and stringifies ACL role lists', () => {
    const acl = {
      id: 'acl:x_read',
      type: 'acl' as const,
      name: 'x read',
      attributes: { roles: ['b', 'a', 42 as unknown as string] },
    }
    expect(normalizeResource(acl).attributes['roles']).toEqual(['42', 'a', 'b'])
  })
})

describe('highestSeverity', () => {
  it('returns "none" for an empty finding list', () => {
    expect(highestSeverity([])).toBe('none')
  })

  it('returns the highest severity present', () => {
    expect(
      highestSeverity([
        { ruleId: 'X', severity: 'low', category: 'C', resourceId: 'r', message: 'm' },
        { ruleId: 'Y', severity: 'high', category: 'C', resourceId: 'r', message: 'm' },
        { ruleId: 'Z', severity: 'medium', category: 'C', resourceId: 'r', message: 'm' },
      ]),
    ).toBe('high')
  })
})
