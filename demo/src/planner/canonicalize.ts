// Deterministic canonical JSON. Sorts object keys; leaves arrays in
// given order. Callers that have set-semantics arrays (like ACL roles)
// must pre-sort them via `normalizeResource` in resource.ts before
// hashing — semantic array ordering is a fact about the resource
// shape, not about JSON serialization.

type Json = unknown

function canonicalize(value: Json): Json {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    out[key] = canonicalize(obj[key])
  }
  return out
}

export function canonicalJson(value: Json): string {
  return JSON.stringify(canonicalize(value))
}
