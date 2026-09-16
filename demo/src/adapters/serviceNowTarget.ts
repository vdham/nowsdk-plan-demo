import type { TargetAdapter } from './targetFixture.js'
import type { Resource, ResourceRef } from '../model/resource.js'

// P1 #17 live target adapter (PRD §20).
//
// Scaffold-only: the class implements the TargetAdapter contract so the
// planner is source-agnostic, but the actual query path is not wired.
// End-to-end wiring is deferred until an instance is available.
//
// Auth model — reuse the SDK's credential alias, do not handle secrets
// directly.
//
// The real ServiceNow SDK stores per-instance credentials under a
// user-configured alias (see `now-sdk auth`). Downstream SDK commands
// then consume the alias via `--auth <alias>` (e.g. `now-sdk query`,
// `now-sdk install`). A production live-target adapter should reuse
// that alias mechanism rather than accepting raw credentials of its
// own:
//
//   1. User configures an authentication alias once, using the
//      SDK's `now-sdk auth` flow (exact invocation varies by release;
//      consult the current ServiceNow SDK docs).
//   2. Plan invocation names the alias:
//        sn-plan-demo plan --target-auth my-dev ...
//   3. This adapter shells out (or uses the SDK's programmatic auth
//      store, if exposed) using `--auth my-dev` to fetch
//      relevantTargetResources — NEVER handling passwords or tokens
//      directly.
//
// Rationale: reusing the SDK's auth path avoids duplicating credential
// storage, matches operator expectations, and lets rotation / MFA /
// OAuth refresh flows work exactly as they do for the rest of the SDK.

export type ServiceNowTargetConfig = {
  // The name of an existing SDK authentication alias (configured via
  // `now-sdk auth`). This adapter does not accept raw credentials —
  // auth is delegated entirely to the SDK's auth store, consumed via
  // `--auth <alias>` on downstream SDK commands.
  alias: string
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ServiceNowTargetConfig {
  const alias = env['SN_INSTANCE_ALIAS']
  if (!alias) {
    throw new Error(
      'ServiceNowTargetAdapter: SN_INSTANCE_ALIAS is not set. Configure an authentication alias via `now-sdk auth` first, then export SN_INSTANCE_ALIAS=<alias-name>.',
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
    // would invoke `now-sdk query ... --auth <alias>` (or use the
    // SDK's programmatic auth store) and normalize the response into
    // Resource[] using the same shape as SdkBuildDesiredAdapter.
    throw new Error(
      `ServiceNowTargetAdapter: not implemented (would call \`now-sdk query ... --auth ${this.config.alias}\`). ` +
        `Use FixtureTargetAdapter or DownloadedMetadataTargetAdapter for now.`,
    )
  }
}
