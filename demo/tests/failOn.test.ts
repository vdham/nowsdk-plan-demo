import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = new URL('..', import.meta.url).pathname
const CLI = join(REPO, 'src/cli.ts')

function runCli(args: string[]): { code: number | null; stdout: string; stderr: string } {
  const res = spawnSync('npx', ['tsx', CLI, ...args], {
    cwd: REPO,
    encoding: 'utf8',
  })
  return { code: res.status, stdout: res.stdout, stderr: res.stderr }
}

describe('--fail-on', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sn-plan-'))
  const planPath = join(dir, 'plan.json')

  it('exits 0 without --fail-on (findings present)', () => {
    const res = runCli([
      'plan',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      planPath,
    ])
    expect(res.code).toBe(0)
  })

  it('exits 3 when --fail-on high is met (demo plan has HIGH findings)', () => {
    const res = runCli([
      'plan',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      planPath,
      '--fail-on',
      'high',
    ])
    expect(res.code).toBe(3)
    expect(res.stdout).toContain('fail-on: threshold high met')
  })

  it('exits 3 when --fail-on medium is met', () => {
    const res = runCli([
      'plan',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      planPath,
      '--fail-on',
      'medium',
    ])
    expect(res.code).toBe(3)
  })

  it('rejects invalid severity', () => {
    const res = runCli([
      'plan',
      '--target-fixture',
      join(REPO, 'fixtures/target-v1.json'),
      '--out',
      planPath,
      '--fail-on',
      'nope',
    ])
    expect(res.code).not.toBe(0)
  })
})
