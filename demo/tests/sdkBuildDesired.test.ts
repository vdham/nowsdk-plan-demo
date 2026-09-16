import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPlan } from '../src/commands/plan.js'
import { runVerify } from '../src/commands/verify.js'
import { SdkBuildDesiredAdapter } from '../src/adapters/sdkBuildDesired.js'

const REPO = new URL('..', import.meta.url).pathname
const BUILD_DIR = join(REPO, 'app/dist')
const DELETES = join(REPO, 'app/plan-explicit-deletes.json')

// These tests depend on `now-sdk build` having been run in demo/app/.
// Skip gracefully if the build artifact is missing so `npm test` does
// not fail on a clean checkout.
const hasBuild = existsSync(join(BUILD_DIR, 'app/update'))

describe.skipIf(!hasBuild)('SdkBuildDesiredAdapter', () => {
  it('parses fields, ACL, and business rule from build XML', async () => {
    const adapter = new SdkBuildDesiredAdapter(BUILD_DIR, DELETES)
    const resources = await adapter.getResources()
    const byType = new Map<string, number>()
    for (const r of resources) byType.set(r.type, (byType.get(r.type) ?? 0) + 1)
    expect(byType.get('field')).toBeGreaterThanOrEqual(3)
    expect(byType.get('acl')).toBe(1)
    expect(byType.get('business_rule')).toBe(1)

    const priority = resources.find((r) => r.id === 'field:x_helloworld_tableone.priority')
    expect(priority?.attributes['type']).toBe('integer')

    const acl = resources.find((r) => r.type === 'acl')
    expect(acl?.id).toBe('acl:x_helloworld_tableone_read')
    expect(acl?.attributes['roles']).toEqual([])

    const br = resources.find((r) => r.type === 'business_rule')
    expect(br?.id).toBe('business_rule:x_helloworld_tableone_state_change')
    expect(br?.attributes['when']).toBe('before')
  })

  it('reads explicit deletes from sibling JSON', async () => {
    const adapter = new SdkBuildDesiredAdapter(BUILD_DIR, DELETES)
    const deletes = await adapter.getExplicitDeletes()
    expect(deletes).toContainEqual({
      id: 'field:x_helloworld_tableone.datetime_field',
      type: 'field',
    })
  })

  it('produces the same demo change summary as the fixture path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sn-plan-'))
    const planPath = join(dir, 'plan.json')
    await runPlan({
      desired: { kind: 'sdk-build', buildDir: BUILD_DIR, explicitDeletesPath: DELETES },
      targetFixture: join(REPO, 'fixtures/target-v1.json'),
      out: planPath,
    })
    const plan = JSON.parse(await readFile(planPath, 'utf8'))
    expect(plan.summary.create).toBe(1)
    expect(plan.summary.modify).toBe(2)
    expect(plan.summary.delete).toBe(1)
    expect(plan.summary.highestSeverity).toBe('high')
    expect(plan.findings.map((f: { ruleId: string }) => f.ruleId).sort()).toEqual([
      'SN-ACL-004',
      'SN-BR-011',
      'SN-TBL-002',
    ])

    const v1 = await runVerify({ plan: planPath, targetFixture: join(REPO, 'fixtures/target-v1.json') })
    expect(v1.status).toBe('READY')
    const v2 = await runVerify({ plan: planPath, targetFixture: join(REPO, 'fixtures/target-v2.json') })
    expect(v2.status).toBe('REPLAN_REQUIRED')
  })
})
