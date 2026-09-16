import type { TargetAdapter } from './targetFixture.js'
import type { Resource, ResourceRef } from '../model/resource.js'

// P1 #17 live target adapter (PRD §20).
//
// Scaffold-only: the class implements the TargetAdapter contract so the
// planner is source-agnostic, but the actual query path is not wired.
// End-to-end wiring is deferred until an instance is available.
//
// Auth model — delegates to `now-sdk auth`.
//
// The real ServiceNow SDK ships `now-sdk auth <alias>` which manages
// credentials (typically OAuth) and stores them under an alias in the
// user's home dir. Downstream commands like `now-sdk query` and
// `now-sdk install` accept `--alias <name>` and pick up the stored
// credentials. A production live-target adapter should reuse that
// mechanism rather than accepting raw credentials of its own:
//
//   1. User runs `now-sdk auth my-dev` (once) to create the alias.
//   2. Plan invocation names the alias:
//        sn-plan-demo plan --target-alias my-dev ...
//   3. This adapter shells out to `now-sdk query --alias my-dev ...`
//      (or uses the SDK's programmatic auth store, if exposed) to
//      fetch relevantTargetResources — NEVER handling passwords or
//      tokens directly.
//
// Rationale: reusing the SDK's auth path avoids duplicating credential
// storage, matches operator expectations, and lets rotation / MFA /
// OAuth refresh flows work exactly as they do for the rest of the SDK.

export type ServiceNowTargetConfig = {
  // The name of an existing `now-sdk auth <alias>` entry. This adapter
  // does not accept raw credentials — auth is delegated entirely to
  // the SDK's auth store.
  alias: string
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ServiceNowTargetConfig {
  const alias = env['SN_INSTANCE_ALIAS']
  if (!alias) {
    throw new Error(
      'ServiceNowTargetAdapter: SN_INSTANCE_ALIAS is not set. Run `now-sdk auth <alias-name>` first, then export SN_INSTANCE_ALIAS=<alias-name>.',
    )
  }
  return { alias }
}

export class ServiceNowTargetAdapter implements TargetAdapter {
  constructor(private readonly config: ServiceNowTargetConfig) {}

  async getResources(_refs: ResourceRef[]): Promise<Resource[]> {
    // Intentional: not implemented. Wiring requires an instance to
    // test against — sending unattested HTTP calls to a URL we can't
    // verify would produce code we can't validate. Production wiring
    // would shell out to `now-sdk query --alias <alias> ...` (or use
    // the SDK's programmatic auth store) and normalize the response
    // into Resource[] using the same shape as SdkBuildDesiredAdapter.
    throw new Error(
      `ServiceNowTargetAdapter: not implemented (would call \`now-sdk query --alias ${this.config.alias}\`). ` +
        `Use FixtureTargetAdapter or DownloadedMetadataTargetAdapter for now.`,
    )
  }
}
