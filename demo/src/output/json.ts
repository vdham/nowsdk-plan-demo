import { writeFile } from 'node:fs/promises'
import type { PlanReceipt } from '../model/plan.js'

export async function writePlanJson(path: string, plan: PlanReceipt): Promise<void> {
  await writeFile(path, JSON.stringify(plan, null, 2) + '\n', 'utf8')
}
