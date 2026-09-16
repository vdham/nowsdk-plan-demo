import { readFile } from 'node:fs/promises'
import { FixtureTargetAdapter } from '../adapters/targetFixture.js'
import { targetFingerprint } from '../planner/fingerprint.js'
import { validatePlanReceipt, type PlanReceipt } from '../model/plan.js'
import { renderVerifyReplan, renderVerifySuccess } from '../output/console.js'
import type { Resource } from '../model/resource.js'

export type VerifyOptions = {
  plan: string
  targetFixture: string
}

export type VerifyResult =
  | { status: 'READY' }
  | { status: 'REPLAN_REQUIRED'; expected: string; actual: string }

export async function runVerify(opts: VerifyOptions): Promise<VerifyResult> {
  const raw = await readFile(opts.plan, 'utf8')
  const plan = JSON.parse(raw) as unknown
  validatePlanReceipt(plan)
  const p = plan as PlanReceipt

  const target: Resource[] = await new FixtureTargetAdapter(
    opts.targetFixture,
  ).getResources(p.relevantRefs)
  const currentFp = targetFingerprint(target)

  if (currentFp === p.targetFingerprint) {
    process.stdout.write(renderVerifySuccess() + '\n')
    return { status: 'READY' }
  }
  process.stdout.write(
    renderVerifyReplan(p.targetFingerprint, currentFp) + '\n',
  )
  return { status: 'REPLAN_REQUIRED', expected: p.targetFingerprint, actual: currentFp }
}
