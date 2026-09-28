import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DesiredFixtureAdapter } from '../src/adapters/desiredFixture.js'
import { FixtureTargetAdapter } from '../src/adapters/targetFixture.js'
import { DownloadedMetadataTargetAdapter } from '../src/adapters/downloadedMetadataTarget.js'

describe('DesiredFixtureAdapter', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sn-desired-'))
  })

  it('throws when the file has no "resources" array', async () => {
    const bad = join(dir, 'bad.json')
    await writeFile(bad, JSON.stringify({ notResources: [] }), 'utf8')
    const adapter = new DesiredFixtureAdapter(bad)
    await expect(adapter.getResources()).rejects.toThrow(/expected "resources" array/)
  })

  it('returns [] for explicitDeletes when the key is omitted', async () => {
    const ok = join(dir, 'ok.json')
    await writeFile(ok, JSON.stringify({ resources: [] }), 'utf8')
    const adapter = new DesiredFixtureAdapter(ok)
    expect(await adapter.getResources()).toEqual([])
    expect(await adapter.getExplicitDeletes()).toEqual([])
  })
})

describe('FixtureTargetAdapter', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sn-target-'))
  })

  it('throws when the file has no "resources" array', async () => {
    const bad = join(dir, 'bad.json')
    await writeFile(bad, JSON.stringify({}), 'utf8')
    const adapter = new FixtureTargetAdapter(bad)
    await expect(adapter.getResources([])).rejects.toThrow(/expected "resources" array/)
  })

  it('filters returned resources to the requested refs', async () => {
    const path = join(dir, 'target.json')
    await writeFile(
      path,
      JSON.stringify({
        resources: [
          { id: 'field:t.a', type: 'field', name: 'a', attributes: {} },
          { id: 'field:t.b', type: 'field', name: 'b', attributes: {} },
          { id: 'acl:t_read', type: 'acl', name: 't read', attributes: { roles: [] } },
        ],
      }),
      'utf8',
    )
    const adapter = new FixtureTargetAdapter(path)
    const got = await adapter.getResources([{ id: 'field:t.b', type: 'field' }])
    expect(got.map((r) => r.id)).toEqual(['field:t.b'])
  })
})

describe('DownloadedMetadataTargetAdapter', () => {
  it('throws a directive error when the download directory does not exist', async () => {
    const adapter = new DownloadedMetadataTargetAdapter('/tmp/does-not-exist-ever-1928374')
    await expect(adapter.getResources([])).rejects.toThrow(/directory not found/)
  })

  it('parses XML and filters to the requested refs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sn-download-'))
    const updateDir = join(root, 'app', 'update')
    await mkdir(updateDir, { recursive: true })
    await writeFile(
      join(updateDir, 'field.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_dictionary">
  <sys_dictionary action="INSERT_OR_UPDATE">
    <name>x_t</name>
    <element>keep_me</element>
    <internal_type>string</internal_type>
  </sys_dictionary>
</record_update>`,
      'utf8',
    )
    await writeFile(
      join(updateDir, 'other.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_dictionary">
  <sys_dictionary action="INSERT_OR_UPDATE">
    <name>x_t</name>
    <element>drop_me</element>
    <internal_type>string</internal_type>
  </sys_dictionary>
</record_update>`,
      'utf8',
    )

    const adapter = new DownloadedMetadataTargetAdapter(root)
    const got = await adapter.getResources([{ id: 'field:x_t.keep_me', type: 'field' }])
    expect(got.map((r) => r.id)).toEqual(['field:x_t.keep_me'])
  })
})
