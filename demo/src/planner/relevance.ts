import type { Resource, ResourceRef } from '../model/resource.js'

export function refsFromResources(rs: Resource[]): ResourceRef[] {
  return rs.map((r) => ({ id: r.id, type: r.type }))
}

export function unionRefs(...groups: ResourceRef[][]): ResourceRef[] {
  const seen = new Set<string>()
  const out: ResourceRef[] = []
  for (const g of groups) {
    for (const r of g) {
      const key = `${r.type}::${r.id}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(r)
      }
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

// PRD §8 step 3–4: dependencies + rule-data requirements.
// For the demo we only model the fact that risk rule SN-ACL-004 needs
// each candidate ACL's current role set — which is already implied by
// "include the ACL resource." No extra role/table resources are added
// because the demo does not compare them independently.
export function computeRelevantRefs(
  desired: Resource[],
  explicitDeletes: ResourceRef[],
): ResourceRef[] {
  return unionRefs(refsFromResources(desired), explicitDeletes)
}
