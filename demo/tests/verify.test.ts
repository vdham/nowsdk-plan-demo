import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPlan } from '../src/commands/plan.js'
import { runVerify } from '../src/commands/verify.js'

const REPO = new URL('..', import.meta.url).pathname

describe('end-to-end plan + verify', () => {
  let planPath: string

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sn-plan-'))
    planPath = join(dir, 'plan.json')
    await runPlan({
      desired: { kind: 'fixture', path: join(REPO, 'fixtures/desired.json') },
      targetFixture: join(REPO, 'fixtures/target-v1.json'),
      out: planPath,
    })
  })

  it('produces the expected demo change summary', async () => {
    const raw = await import('node:fs/promises').then((m) => m.readFile(planPath, 'utf8'))
    const plan = JSON.parse(raw)
    expect(plan.summary.create).toBe(1)
    expect(plan.summary.modify).toBe(2)
    expect(plan.summary.delete).toBe(1)
    expect(plan.summary.highestSeverity).toBe('high')
    expect(plan.findings.map((f: { ruleId: string }) => f.ruleId).sort()).toEqual([
      'SN-ACL-004',
      'SN-BR-011',
      'SN-TBL-002',
    ])
  })

  it('verify against target-v1 returns READY', async () => {
    const result = await runVerify({
      plan: planPath,
      targetFixture: join(REPO, 'fixtures/target-v1.json'),
    })
    expect(result.status).toBe('READY')
  })

  it('verify against target-v2 returns REPLAN_REQUIRED', async () => {
    const result = await runVerify({
      plan: planPath,
      targetFixture: join(REPO, 'fixtures/target-v2.json'),
    })
    expect(result.status).toBe('REPLAN_REQUIRED')
  })

  it('unrelated fixture ordering change produces same targetFingerprint', async () => {
    const raw = await import('node:fs/promises').then((m) =>
      m.readFile(join(REPO, 'fixtures/target-v1.json'), 'utf8'),
    )
    const parsed = JSON.parse(raw)
    parsed.resources.reverse()
    const dir = await mkdtemp(join(tmpdir(), 'sn-plan-'))
    const reordered = join(dir, 'target-v1-reordered.json')
    await writeFile(reordered, JSON.stringify(parsed), 'utf8')
    const result = await runVerify({ plan: planPath, targetFixture: reordered })
    expect(result.status).toBe('READY')
  })
})
