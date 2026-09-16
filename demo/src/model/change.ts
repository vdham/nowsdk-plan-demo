import type { Resource, ResourceType } from './resource.js'

export type ChangeType = 'CREATE' | 'MODIFY' | 'DELETE' | 'NOOP'

export type Change = {
  type: ChangeType
  resourceId: string
  resourceType: ResourceType
  before?: Resource
  after?: Resource
}

export type ChangeSet = {
  changes: Change[]
}
