import { describe, it, expect } from 'vitest'
import {
  ServiceNowTargetAdapter,
  loadConfigFromEnv,
} from '../src/adapters/serviceNowTarget.js'
import { DownloadedMetadataTargetAdapter } from '../src/adapters/downloadedMetadataTarget.js'

describe('ServiceNowTargetAdapter (scaffold)', () => {
  it('loadConfigFromEnv rejects missing SN_INSTANCE_ALIAS with a helpful message', () => {
    expect(() => loadConfigFromEnv({})).toThrow(/SN_INSTANCE_ALIAS/)
    expect(() => loadConfigFromEnv({})).toThrow(/now-sdk auth/)
  })

  it('not-implemented error mentions --auth (matches real SDK flag)', async () => {
    const adapter = new ServiceNowTargetAdapter({ alias: 'my-dev' })
    await expect(adapter.getResources([])).rejects.toThrow(/--auth my-dev/)
  })

  it('loadConfigFromEnv builds a config when the alias is present', () => {
    const cfg = loadConfigFromEnv({ SN_INSTANCE_ALIAS: 'my-dev' })
    expect(cfg.alias).toBe('my-dev')
  })

  it('getResources currently throws a not-implemented error, not a silent no-op', async () => {
    const adapter = new ServiceNowTargetAdapter({ alias: 'my-dev' })
    await expect(adapter.getResources([])).rejects.toThrow(/not implemented/i)
    await expect(adapter.getResources([])).rejects.toThrow(/my-dev/)
  })
})

describe('DownloadedMetadataTargetAdapter (scaffold)', () => {
  it('throws a helpful error when the download dir does not exist', async () => {
    const adapter = new DownloadedMetadataTargetAdapter('/tmp/nope-does-not-exist-xyz')
    await expect(adapter.getResources([])).rejects.toThrow(/directory not found/i)
  })
})
