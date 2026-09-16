import { existsSync } from 'node:fs'
import type { TargetAdapter } from './targetFixture.js'
import { SdkBuildDesiredAdapter } from './sdkBuildDesired.js'
import type { Resource, ResourceRef } from '../model/resource.js'

// P1 #18 downloaded-metadata target adapter (PRD §20).
//
// If the user has previously run `now-sdk download` (or otherwise
// obtained the app's XML metadata bundle) into a local directory, we
// can parse it with the exact same XML shape logic used by
// SdkBuildDesiredAdapter — because ServiceNow emits identical
// sys_dictionary/sys_security_acl/sys_script XML for build output and
// downloaded metadata.
//
// This adapter reuses the build adapter's parsing and just narrows
// the returned set to the requested refs.

export class DownloadedMetadataTargetAdapter implements TargetAdapter {
  constructor(private readonly downloadDir: string) {}

  async getResources(refs: ResourceRef[]): Promise<Resource[]> {
    if (!existsSync(this.downloadDir)) {
      throw new Error(
        `DownloadedMetadataTargetAdapter: directory not found: ${this.downloadDir}. ` +
          `Run \`now-sdk download\` (or copy an application update-set XML tree) first.`,
      )
    }
    // Delegate parsing to the SDK-build adapter (same XML shape).
    // Explicit-deletes are irrelevant for a target adapter, so use a
    // path we know is absent; getExplicitDeletes will return [].
    const parser = new SdkBuildDesiredAdapter(this.downloadDir, `${this.downloadDir}/__noop__.json`)
    const all = await parser.getResources()
    const wanted = new Set(refs.map((r) => `${r.type}::${r.id}`))
    return all.filter((r) => wanted.has(`${r.type}::${r.id}`))
  }
}
