import { readFile } from 'node:fs/promises'
import type { Resource, ResourceRef } from '../model/resource.js'

export interface DesiredResourceAdapter {
  getResources(): Promise<Resource[]>
  getExplicitDeletes(): Promise<ResourceRef[]>
}

type DesiredFile = {
  resources: Resource[]
  explicitDeletes?: ResourceRef[]
}

export class DesiredFixtureAdapter implements DesiredResourceAdapter {
  constructor(private readonly path: string) {}

  async load(): Promise<DesiredFile> {
    const raw = await readFile(this.path, 'utf8')
    const parsed = JSON.parse(raw) as DesiredFile
    if (!Array.isArray(parsed.resources)) {
      throw new Error(`${this.path}: expected "resources" array`)
    }
    return parsed
  }

  async getResources(): Promise<Resource[]> {
    return (await this.load()).resources
  }

  async getExplicitDeletes(): Promise<ResourceRef[]> {
    return (await this.load()).explicitDeletes ?? []
  }
}
