import { describe, it, expect } from 'vitest'
import { resolveChanges } from '../src/planner/diff.js'
import type { Resource, ResourceRef } from '../src/model/resource.js'

const field = (id: string, attrs: Record<string, unknown> = {}): Resource => ({
  id,
  type: 'field',
  name: id,
  attributes: attrs,
})

describe('resolveChanges', () => {
  it('detects CREATE when desired exists and target does not', () => {
    const cs = resolveChanges([field('a')], [], [])
    expect(cs.changes).toHaveLength(1)
    expect(cs.changes[0]?.type).toBe('CREATE')
  })

  it('detects MODIFY when attributes differ', () => {
    const cs = resolveChanges(
      [field('a', { type: 'string' })],
      [field('a', { type: 'integer' })],
      [],
    )
    expect(cs.changes[0]?.type).toBe('MODIFY')
  })

  it('detects NOOP when equivalent', () => {
    const cs = resolveChanges(
      [field('a', { type: 'string' })],
      [field('a', { type: 'string' })],
      [],
    )
    expect(cs.changes[0]?.type).toBe('NOOP')
  })

  it('detects DELETE only when explicit', () => {
    const explicit: ResourceRef[] = [{ id: 'a', type: 'field' }]
    const cs = resolveChanges([], [field('a')], explicit)
    expect(cs.changes).toHaveLength(1)
    expect(cs.changes[0]?.type).toBe('DELETE')
  })

  it('does NOT emit DELETE for a target resource absent locally but not explicitly deleted', () => {
    const cs = resolveChanges([], [field('a')], [])
    expect(cs.changes.some((c) => c.type === 'DELETE')).toBe(false)
    expect(cs.changes).toHaveLength(0)
  })

  it('is stable under desired reordering', () => {
    const a = field('a', { type: 'string' })
    const b = field('b', { type: 'integer' })
    const cs1 = resolveChanges([a, b], [], [])
    const cs2 = resolveChanges([b, a], [], [])
    expect(cs1).toEqual(cs2)
  })
})
