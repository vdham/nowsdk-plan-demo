import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import type { DesiredResourceAdapter } from './desiredFixture.js'
import type { Resource, ResourceRef } from '../model/resource.js'

// Parses `now-sdk build` output under <buildDir>/app/update/*.xml into
// normalized Resource[]. The prototype models delete intent explicitly
// via a sibling JSON file rather than reproducing the SDK's full
// delete-generation semantics — `now-sdk build --generate-deletes`
// (default: true) is the mechanism production `plan` would consume.
// See <buildDir>/../plan-explicit-deletes.json for the demo's list.

type XmlNode = Record<string, unknown> & { [k: string]: unknown }

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
})

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object' && v !== null && '#text' in (v as XmlNode)) {
    const t = (v as XmlNode)['#text']
    return typeof t === 'string' ? t : undefined
  }
  return undefined
}

function asBool(v: unknown): boolean {
  return asString(v)?.toLowerCase() === 'true'
}

function parseDictionaryField(record: XmlNode): Resource | null {
  const table = asString(record['name'])
  const element = asString(record['element']) ?? asString(record['@_element'])
  const internalType = asString(record['internal_type'])
  if (!table || !element || element === 'NULL' || !internalType) return null
  return {
    id: `field:${table}.${element}`,
    type: 'field',
    name: element,
    attributes: {
      table,
      type: internalType,
      label: asString(record['column_label']) ?? element,
      mandatory: asBool(record['mandatory']),
    },
  }
}

function parseAcl(record: XmlNode): Resource | null {
  const name = asString(record['name'])
  const operation = asString(record['operation'])
  if (!name || !operation) return null
  // Role list comes from separate sys_security_acl_role rows (join
  // table). For P1 we don't parse them yet — an ACL with no linked
  // roles is emitted with roles=[]. This is faithful to the demo's
  // desired-state ACL, which is intentionally roles=[].
  return {
    id: `acl:${name}_${operation}`,
    type: 'acl',
    name: `${name} ${operation}`,
    attributes: {
      table: name,
      operation,
      type: asString(record['type']) ?? 'record',
      roles: [],
    },
  }
}

function parseBusinessRule(record: XmlNode): Resource {
  const collection = asString(record['collection']) ?? ''
  const name = asString(record['name']) ?? ''
  const when = asString(record['when']) ?? 'before'
  return {
    id: `business_rule:${collection}_${normalizeName(name)}`,
    type: 'business_rule',
    name,
    attributes: {
      table: collection,
      when,
      active: asBool(record['active']),
    },
  }
}

const DISPATCH: Record<string, (r: XmlNode) => Resource | null> = {
  sys_dictionary: parseDictionaryField,
  sys_security_acl: parseAcl,
  sys_script: parseBusinessRule,
}

async function parseUpdateFile(path: string): Promise<Resource | null> {
  const raw = await readFile(path, 'utf8')
  const parsed = parser.parse(raw) as { record_update?: XmlNode }
  const wrapper = parsed.record_update
  if (!wrapper) return null
  const [tableKey] = Object.keys(wrapper).filter((k) => !k.startsWith('@_'))
  if (!tableKey) return null
  const handler = DISPATCH[tableKey]
  if (!handler) return null
  const record = wrapper[tableKey]
  if (typeof record !== 'object' || record === null) return null
  return handler(record as XmlNode)
}

type ExplicitDeletesFile = { explicitDeletes?: ResourceRef[] }

export class SdkBuildDesiredAdapter implements DesiredResourceAdapter {
  constructor(
    private readonly buildDir: string,
    private readonly explicitDeletesPath: string,
  ) {}

  async getResources(): Promise<Resource[]> {
    const updateDir = join(this.buildDir, 'app', 'update')
    const entries = await readdir(updateDir)
    const results: Resource[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.xml')) continue
      const r = await parseUpdateFile(join(updateDir, entry))
      if (r) results.push(r)
    }
    results.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    return results
  }

  async getExplicitDeletes(): Promise<ResourceRef[]> {
    try {
      const raw = await readFile(this.explicitDeletesPath, 'utf8')
      const parsed = JSON.parse(raw) as ExplicitDeletesFile
      return parsed.explicitDeletes ?? []
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }
}
