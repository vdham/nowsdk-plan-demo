import { describe, it, expect } from 'vitest'
import {
  ServiceNowTargetAdapter,
  loadConfigFromEnv,
} from '../src/adapters/serviceNowTarget.js'
import { DownloadedMetadataTargetAdapter } from '../src/adapters/downloadedMetadataTarget.js'

describe('ServiceNowTargetAdapter (scaffold)', () => {
  it('loadConfigFromEnv rejects missing env vars with a helpful message', () => {
    expect(() => loadConfigFromEnv({})).toThrow(/SN_INSTANCE_URL, SN_USER, SN_PASSWORD/)
  })

  it('loadConfigFromEnv builds a config when all vars are present', () => {
    const cfg = loadConfigFromEnv({
      SN_INSTANCE_URL: 'https://ex.service-now.com',
      SN_USER: 'u',
      SN_PASSWORD: 'p',
    })
    expect(cfg.instanceUrl).toBe('https://ex.service-now.com')
    expect(cfg.auth).toMatchObject({ kind: 'basic', user: 'u' })
  })

  it('getResources currently throws a not-implemented error, not a silent no-op', async () => {
    const adapter = new ServiceNowTargetAdapter({
      instanceUrl: 'https://ex.service-now.com',
      auth: { kind: 'basic', user: 'u', password: 'p' },
    })
    await expect(adapter.getResources([])).rejects.toThrow(/not implemented/i)
  })
})

describe('DownloadedMetadataTargetAdapter (scaffold)', () => {
  it('throws a helpful error when the download dir does not exist', async () => {
    const adapter = new DownloadedMetadataTargetAdapter('/tmp/nope-does-not-exist-xyz')
    await expect(adapter.getResources([])).rejects.toThrow(/directory not found/i)
  })
})
