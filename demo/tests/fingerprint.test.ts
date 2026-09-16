import { describe, it, expect } from 'vitest'
import {
  artifactDigest,
  targetFingerprint,
  changeSetDigest,
} from '../src/planner/fingerprint.js'
import { resolveChanges } from '../src/planner/diff.js'
import type { Resource } from '../src/model/resource.js'

const r = (id: string, attrs: Record<string, unknown> = {}): Resource => ({
  id,
  type: 'field',
  name: id,
  attributes: attrs,
})

describe('fingerprints', () => {
  it('are stable under resource reordering', () => {
    const a = r('a', { type: 'string' })
    const b = r('b', { type: 'integer' })
    expect(artifactDigest([a, b], [])).toBe(artifactDigest([b, a], []))
    expect(targetFingerprint([a, b])).toBe(targetFingerprint([b, a]))
  })

  it('are stable under attribute key reordering', () => {
    const a1 = r('a', { type: 'string', label: 'A', mandatory: true })
    const a2 = r('a', { mandatory: true, label: 'A', type: 'string' })
    expect(targetFingerprint([a1])).toBe(targetFingerprint([a2]))
  })

  it('are stable under ACL role reordering (set semantics)', () => {
    const acl1: Resource = {
      id: 'acl:x',
      type: 'acl',
      name: 'x',
      attributes: { roles: ['a', 'b', 'c'] },
    }
    const acl2: Resource = {
      id: 'acl:x',
      type: 'acl',
      name: 'x',
      attributes: { roles: ['c', 'a', 'b'] },
    }
    expect(targetFingerprint([acl1])).toBe(targetFingerprint([acl2]))
  })

  it('change when relevant target attributes change', () => {
    const before = r('a', { type: 'string' })
    const after = r('a', { type: 'integer' })
    expect(targetFingerprint([before])).not.toBe(targetFingerprint([after]))
  })

  it('changeSetDigest is stable for equivalent change sets', () => {
    const desired = [r('a', { x: 1 })]
    const target = [r('a', { x: 2 })]
    const cs1 = resolveChanges(desired, target, [])
    const cs2 = resolveChanges(desired, target, [])
    expect(changeSetDigest(cs1)).toBe(changeSetDigest(cs2))
  })
})
