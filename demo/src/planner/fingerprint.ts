import { createHash } from 'node:crypto'
import { canonicalJson } from './canonicalize.js'
import { normalizeResources, type Resource, type ResourceRef } from '../model/resource.js'
import type { ChangeSet } from '../model/change.js'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function sortResources(rs: Resource[]): Resource[] {
  return [...normalizeResources(rs)].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
}

function sortRefs(rs: ResourceRef[]): ResourceRef[] {
  return [...rs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export function artifactDigest(
  desired: Resource[],
  explicitDeletes: ResourceRef[],
): string {
  const payload = {
    desired: sortResources(desired),
    deletes: sortRefs(explicitDeletes),
  }
  return sha256(canonicalJson(payload))
}

export function targetFingerprint(relevant: Resource[]): string {
  return sha256(canonicalJson(sortResources(relevant)))
}

export function changeSetDigest(cs: ChangeSet): string {
  // Fingerprint only proposed operations. NOOPs are resolver output
  // but never something a reviewer approves or rejects, and the plan
  // receipt filters them from `changes[]` — so the digest must match
  // what's actually shown, not the pre-filter set.
  const proposed = cs.changes.filter((c) => c.type !== 'NOOP')
  const sorted = [...proposed].sort((a, b) =>
    a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0,
  )
  return sha256(canonicalJson({ changes: sorted }))
}
