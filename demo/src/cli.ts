#!/usr/bin/env -S npx tsx
import { Command, InvalidArgumentError } from 'commander'
import { runPlan } from './commands/plan.js'
import { runVerify } from './commands/verify.js'
import { SEVERITY_RANK, type Severity } from './model/finding.js'

function parseSeverity(v: string): Severity {
  const norm = v.toLowerCase()
  if (norm === 'low' || norm === 'medium' || norm === 'high') return norm
  throw new InvalidArgumentError('must be one of: low, medium, high')
}

const program = new Command()
program.name('sn-plan-demo').description('now-sdk plan prototype').version('0.1.0')

program
  .command('plan')
  .description('Generate a plan by comparing desired resources against a target fixture.')
  .option(
    '--desired-source <kind>',
    'Where desired state comes from: "fixture" or "sdk-build"',
    'fixture',
  )
  .option(
    '--desired-fixture <path>',
    'Path to desired-resources fixture (when --desired-source=fixture)',
    'fixtures/desired.json',
  )
  .option(
    '--desired-build-dir <path>',
    'Path to now-sdk build output dir (when --desired-source=sdk-build)',
    'app/dist',
  )
  .option(
    '--desired-explicit-deletes <path>',
    'Path to explicit-deletes JSON (when --desired-source=sdk-build)',
    'app/plan-explicit-deletes.json',
  )
  .requiredOption('--target-fixture <path>', 'Path to target-state fixture')
  .option('--out <path>', 'Path to write plan.json', 'plan.json')
  .option(
    '--fail-on <severity>',
    'Exit with code 3 if any finding is at or above this severity (low|medium|high)',
    parseSeverity,
  )
  .option(
    '--explain',
    'Ask Claude to annotate each finding with plain-English explanation, blast radius, and remediation steps. Requires ANTHROPIC_API_KEY. Does not affect risk classification.',
  )
  .action(async (opts) => {
    const desired =
      opts.desiredSource === 'sdk-build'
        ? {
            kind: 'sdk-build' as const,
            buildDir: opts.desiredBuildDir,
            explicitDeletesPath: opts.desiredExplicitDeletes,
          }
        : { kind: 'fixture' as const, path: opts.desiredFixture }
    const { AnthropicExplanationClient } = await import('./explain/index.js')
    const explainClient = opts.explain ? new AnthropicExplanationClient() : undefined
    const plan = await runPlan({
      desired,
      targetFixture: opts.targetFixture,
      out: opts.out,
      explainClient,
    })
    if (opts.failOn) {
      const threshold = SEVERITY_RANK[opts.failOn as Severity]
      const tripped = plan.findings.some((f) => SEVERITY_RANK[f.severity] >= threshold)
      if (tripped) {
        process.stdout.write(
          `\nfail-on: threshold ${opts.failOn} met or exceeded.\n`,
        )
        process.exitCode = 3
      }
    }
  })

program
  .command('verify')
  .description('Verify a plan against current target state. Emits READY or REPLAN_REQUIRED.')
  .requiredOption('--plan <path>', 'Path to plan.json')
  .requiredOption('--target-fixture <path>', 'Path to target-state fixture')
  .action(async (opts) => {
    const result = await runVerify({ plan: opts.plan, targetFixture: opts.targetFixture })
    if (result.status !== 'READY') process.exitCode = 2
  })

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
