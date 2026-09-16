export type ResourceType = 'field' | 'acl' | 'business_rule'

export type Resource = {
  id: string
  type: ResourceType
  name: string
  attributes: Record<string, unknown>
}

export type ResourceRef = {
  id: string
  type: ResourceType
}

// Set-semantics for ACL role lists: order carries no meaning, so we
// normalize to a sorted form. Anything else is left alone.
export function normalizeResource(r: Resource): Resource {
  if (r.type !== 'acl') return r
  const roles = r.attributes['roles']
  if (!Array.isArray(roles)) return r
  const sorted = [...roles]
    .map((x) => (typeof x === 'string' ? x : String(x)))
    .sort()
  return { ...r, attributes: { ...r.attributes, roles: sorted } }
}

export function normalizeResources(rs: Resource[]): Resource[] {
  return rs.map(normalizeResource)
}
