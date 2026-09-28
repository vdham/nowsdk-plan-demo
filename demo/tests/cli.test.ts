import { describe, it, expect, beforeAll, afterEach, beforeEach, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommanderError } from 'commander'
import { buildProgram, main } from '../src/cli.js'
import { runPlan } from '../src/commands/plan.js'

const REPO = new URL('..', import.meta.url).pathname
const CLI = join(REPO, 'src/cli.ts')

// --- helpers ---------------------------------------------------------

function spawnCli(
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): { code: number | null; stdout: string; stderr: string } {
  const res = spawnSync('npx', ['tsx', CLI, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
  })
  return { code: res.status, stdout: res.stdout, stderr: res.stderr }
}

// In-process runner that mimics `main(argv)` but with commander's
// process.exit disabled so parse errors don't kill the test runner.
// Commander's own errors surface as CommanderError; we translate their
// exitCode field into process.exitCode, matching production behavior.
async function runInProcess(args: string[]): Promise<{ exitCode: number }> {
  const program = buildProgram()
  program.exitOverride()
  // Silence commander's own writes (missing-option messages, help,
  // etc.) so the test output stays readable.
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  })
  const fakeArgv = ['node', 'sn-plan-demo', ...args]
  process.exitCode = 0
  try {
    await program.parseAsync(fakeArgv)
  } catch (err) {
    if (err instanceof CommanderError) {
      // help / version exit with 0; unknown option / missing arg with 1.
      process.exitCode = err.exitCode || 0
    } else {
      process.exitCode = 1
    }
  }
  return { exitCode: process.exitCode ?? 0 }
}

// --- in-process tests (counted by v8 coverage) -----------------------

describe('cli in-process: plan', () => {
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sn-cli-inproc-'))
  })

  afterEach(() => {
    process.exitCode = 0
  })

  it('runs the plan command against the fixture target (exit 0)', async () => {
    const out = join(dir, 'basic.json')
    const { exitCode } = await runInProcess([
      'plan',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      out,
    ])
    expect(exitCode).toBe(0)
    const plan = JSON.parse(await readFile(out, 'utf8'))
    expect(plan.summary.create).toBe(1)
    expect(plan.summary.modify).toBe(2)
    expect(plan.summary.delete).toBe(1)
  })

  it('sets exitCode=3 when --fail-on high is met', async () => {
    const out = join(dir, 'failon-high.json')
    const { exitCode } = await runInProcess([
      'plan',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      out,
      '--fail-on',
      'high',
    ])
    expect(exitCode).toBe(3)
  })

  it('sets exitCode=3 when --fail-on medium is met', async () => {
    const out = join(dir, 'failon-med.json')
    const { exitCode } = await runInProcess([
      'plan',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      out,
      '--fail-on',
      'medium',
    ])
    expect(exitCode).toBe(3)
  })

  it('leaves exitCode=0 with --fail-on when no finding meets the threshold', async () => {
    // Point the plan at a target that already matches desired — no
    // findings, so even --fail-on low should not trip.
    const out = join(dir, 'failon-noop.json')
    // Build a target that matches desired.json exactly.
    const desired = JSON.parse(
      await readFile(join(REPO, 'fixtures/desired.json'), 'utf8'),
    )
    const identicalTarget = join(dir, 'identical-target.json')
    await writeFile(
      identicalTarget,
      JSON.stringify({ resources: desired.resources }),
      'utf8',
    )
    const { exitCode } = await runInProcess([
      'plan',
      '--desired-fixture',
      join(REPO, 'fixtures/desired.json'),
      '--target-fixture',
      identicalTarget,
      '--out',
      out,
      '--fail-on',
      'low',
    ])
    expect(exitCode).toBe(0)
  })

  it('rejects --fail-on with an invalid severity (nonzero exit)', async () => {
    const { exitCode } = await runInProcess([
      'plan',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      join(dir, 'bad-sev.json'),
      '--fail-on',
      'nope',
    ])
    expect(exitCode).not.toBe(0)
  })

  it('errors out (nonzero) when --target-fixture is missing', async () => {
    const { exitCode } = await runInProcess([
      'plan',
      '--out',
      join(dir, 'missing.json'),
    ])
    expect(exitCode).not.toBe(0)
  })

  it('routes --desired-source=sdk-build through the SdkBuildDesiredAdapter', async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), 'sn-cli-inproc-build-'))
    const updateDir = join(buildRoot, 'app', 'update')
    await mkdir(updateDir, { recursive: true })
    await writeFile(
      join(updateDir, 'field.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_dictionary">
  <sys_dictionary action="INSERT_OR_UPDATE">
    <name>x_helloworld_tableone</name>
    <element>brand_new</element>
    <internal_type>string</internal_type>
    <column_label>Brand New</column_label>
    <mandatory>false</mandatory>
  </sys_dictionary>
</record_update>`,
      'utf8',
    )
    const deletesPath = join(buildRoot, 'plan-explicit-deletes.json')
    await writeFile(deletesPath, JSON.stringify({ explicitDeletes: [] }), 'utf8')

    const out = join(dir, 'from-build.json')
    const { exitCode } = await runInProcess([
      'plan',
      '--desired-source',
      'sdk-build',
      '--desired-build-dir',
      buildRoot,
      '--desired-explicit-deletes',
      deletesPath,
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      out,
    ])
    expect(exitCode).toBe(0)
    const plan = JSON.parse(await readFile(out, 'utf8'))
    expect(plan.summary.create).toBe(1)
  })

  it('exits with a message when --explain is set but ANTHROPIC_API_KEY is unset', async () => {
    const original = process.env['ANTHROPIC_API_KEY']
    delete process.env['ANTHROPIC_API_KEY']
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main([
        'node',
        'sn-plan-demo',
        'plan',
        '--target-fixture',
        join(REPO, 'fixtures/target-v1.json'),
        '--out',
        join(dir, 'explain.json'),
        '--explain',
      ])
      expect(process.exitCode).toBe(1)
      expect(errSpy).toHaveBeenCalled()
      const msg = errSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(msg).toContain('ANTHROPIC_API_KEY')
    } finally {
      errSpy.mockRestore()
      if (original === undefined) delete process.env['ANTHROPIC_API_KEY']
      else process.env['ANTHROPIC_API_KEY'] = original
      process.exitCode = 0
    }
  })
})

describe('cli in-process: verify', () => {
  let planPath: string

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sn-cli-verify-inproc-'))
    planPath = join(dir, 'plan.json')
    await runPlan({
      desired: { kind: 'fixture', path: join(REPO, 'fixtures/desired.json') },
      targetFixture: join(REPO, 'fixtures/target-v1.json'),
      out: planPath,
    })
  })

  afterEach(() => {
    process.exitCode = 0
  })

  it('exits 0 when the target still matches', async () => {
    const { exitCode } = await runInProcess([
      'verify',
      '--plan',
      planPath,
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
    ])
    expect(exitCode).toBe(0)
  })

  it('exits 2 when the target has drifted', async () => {
    const { exitCode } = await runInProcess([
      'verify',
      '--plan',
      planPath,
      '--target-fixture',
      join(REPO, 'fixtures/target-v2.json'),
    ])
    expect(exitCode).toBe(2)
  })

  it('errors out when --plan is missing', async () => {
    const { exitCode } = await runInProcess([
      'verify',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
    ])
    expect(exitCode).not.toBe(0)
  })
})

describe('cli in-process: top-level', () => {
  beforeEach(() => {
    process.exitCode = 0
  })

  it('recognizes --version', async () => {
    const { exitCode } = await runInProcess(['--version'])
    // Commander throws with exitCode 0 for version.
    expect(exitCode).toBe(0)
  })

  it('exits nonzero on an unknown subcommand', async () => {
    const { exitCode } = await runInProcess(['not-a-real-command'])
    expect(exitCode).not.toBe(0)
  })

  it('main() prints the error and sets exitCode=1 on a thrown non-Commander error', async () => {
    // A verify against a plan file that does not exist throws in
    // runVerify, which surfaces through main()'s catch block.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main([
        'node',
        'sn-plan-demo',
        'verify',
        '--plan',
        '/tmp/does-not-exist-plan-xyz.json',
        '--target-fixture',
        join(REPO, 'fixtures/target-v1.json'),
      ])
      expect(process.exitCode).toBe(1)
      expect(errSpy).toHaveBeenCalled()
    } finally {
      errSpy.mockRestore()
      process.exitCode = 0
    }
  })
})

// --- spawn-based smoke test (kept as a real end-to-end signal) -------

describe('cli end-to-end (spawn)', () => {
  it('runs from the shell and produces plan.json + stdout', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sn-cli-spawn-'))
    const planPath = join(dir, 'plan.json')
    const res = spawnCli([
      'plan',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      planPath,
    ])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('+ 1 CREATE')
    expect(JSON.parse(await readFile(planPath, 'utf8')).summary.create).toBe(1)
  })
})
