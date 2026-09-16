import type { TargetAdapter } from './targetFixture.js'
import type { Resource, ResourceRef } from '../model/resource.js'

// P1 #17 live target adapter (PRD §20).
//
// Scaffold-only: the class implements the TargetAdapter contract so the
// planner is source-agnostic, but the actual query path is not wired.
// End-to-end wiring is deferred until an instance is available.
//
// Auth model (basic auth for demo purposes; OAuth would layer on top):
//   env SN_INSTANCE_URL    e.g. https://myinstance.service-now.com
//   env SN_USER
//   env SN_PASSWORD
//
// Mapping per PRD §20:
//   field         -> sys_dictionary               (filter: name IN table, element IN elements)
//   acl           -> sys_security_acl (+ sys_security_acl_role for role set)
//   business_rule -> sys_script                   (filter by collection + sys_name)

export type ServiceNowTargetConfig = {
  instanceUrl: string
  auth: { kind: 'basic'; user: string; password: string }
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ServiceNowTargetConfig {
  const instanceUrl = env['SN_INSTANCE_URL']
  const user = env['SN_USER']
  const password = env['SN_PASSWORD']
  const missing = ['SN_INSTANCE_URL', 'SN_USER', 'SN_PASSWORD'].filter((k) => !env[k])
  if (missing.length > 0) {
    throw new Error(
      `ServiceNowTargetAdapter: missing env: ${missing.join(', ')}. Set these to enable live target queries.`,
    )
  }
  return {
    instanceUrl: instanceUrl!,
    auth: { kind: 'basic', user: user!, password: password! },
  }
}

export class ServiceNowTargetAdapter implements TargetAdapter {
  constructor(private readonly config: ServiceNowTargetConfig) {}

  async getResources(_refs: ResourceRef[]): Promise<Resource[]> {
    // Intentional: not implemented. Wiring requires an instance to test
    // against — sending unattested HTTP calls to a URL we can't verify
    // would produce code we can't validate. See README for the plan.
    throw new Error(
      `ServiceNowTargetAdapter: not implemented (would query ${this.config.instanceUrl}). ` +
        `Use FixtureTargetAdapter or DownloadedMetadataTargetAdapter for now.`,
    )
  }
}
