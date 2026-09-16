import { normalizeResource, type Resource, type ResourceRef } from '../model/resource.js'
import type { Change, ChangeSet } from '../model/change.js'
import { canonicalJson } from './canonicalize.js'

function byId(rs: Resource[]): Map<string, Resource> {
  return new Map(rs.map((r) => [r.id, normalizeResource(r)]))
}

function attributesEqual(a: Resource, b: Resource): boolean {
  const na = normalizeResource(a)
  const nb = normalizeResource(b)
  return (
    canonicalJson(na.attributes) === canonicalJson(nb.attributes) &&
    na.name === nb.name &&
    na.type === nb.type
  )
}

// PRD §12 — deterministic. Does NOT infer DELETE from absence; deletion
// requires an explicit ref.
export function resolveChanges(
  desired: Resource[],
  target: Resource[],
  explicitDeletes: ResourceRef[],
): ChangeSet {
  const desiredById = byId(desired)
  const targetById = byId(target)
  const emitted = new Set<string>()
  const changes: Change[] = []

  for (const d of desired) {
    const t = targetById.get(d.id)
    if (!t) {
      changes.push({
        type: 'CREATE',
        resourceId: d.id,
        resourceType: d.type,
        after: d,
      })
    } else if (!attributesEqual(d, t)) {
      changes.push({
        type: 'MODIFY',
        resourceId: d.id,
        resourceType: d.type,
        before: t,
        after: d,
      })
    } else {
      changes.push({
        type: 'NOOP',
        resourceId: d.id,
        resourceType: d.type,
        before: t,
        after: d,
      })
    }
    emitted.add(d.id)
  }

  for (const ref of explicitDeletes) {
    if (emitted.has(ref.id)) continue
    const t = targetById.get(ref.id)
    if (t) {
      changes.push({
        type: 'DELETE',
        resourceId: ref.id,
        resourceType: ref.type,
        before: t,
      })
    } else {
      // Explicit delete of something already absent: NOOP.
      changes.push({
        type: 'NOOP',
        resourceId: ref.id,
        resourceType: ref.type,
      })
    }
    emitted.add(ref.id)
  }

  // Intentionally: target resources not covered by desired or explicit
  // deletes do NOT produce DELETE — they are treated as unmanaged.
  void desiredById

  changes.sort((a, b) =>
    a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0,
  )
  return { changes }
}
