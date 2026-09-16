import { readFile } from 'node:fs/promises'
import type { Resource, ResourceRef } from '../model/resource.js'

export interface TargetAdapter {
  getResources(refs: ResourceRef[]): Promise<Resource[]>
}

type TargetFile = {
  resources: Resource[]
}

export class FixtureTargetAdapter implements TargetAdapter {
  constructor(private readonly path: string) {}

  async getResources(refs: ResourceRef[]): Promise<Resource[]> {
    const raw = await readFile(this.path, 'utf8')
    const parsed = JSON.parse(raw) as TargetFile
    if (!Array.isArray(parsed.resources)) {
      throw new Error(`${this.path}: expected "resources" array`)
    }
    const wanted = new Set(refs.map((r) => `${r.type}::${r.id}`))
    return parsed.resources.filter((r) => wanted.has(`${r.type}::${r.id}`))
  }
}
