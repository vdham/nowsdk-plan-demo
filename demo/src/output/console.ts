import type { PlanReceipt } from '../model/plan.js'

const SEV_LABEL: Record<string, string> = {
  high: 'HIGH',
  medium: 'MED ',
  low: 'LOW ',
}

export function renderPlanConsole(
  plan: PlanReceipt,
  ctx: { appLabel: string; targetLabel: string },
): string {
  const lines: string[] = []
  lines.push(`App: ${ctx.appLabel}`)
  lines.push(`Target: ${ctx.targetLabel}`)
  lines.push('')
  lines.push(`+ ${plan.summary.create} CREATE`)
  lines.push(`~ ${plan.summary.modify} MODIFY`)
  lines.push(`- ${plan.summary.delete} DELETE`)
  lines.push('')
  lines.push(`Coverage: ${plan.coverage}`)
  lines.push(`Highest risk: ${plan.summary.highestSeverity.toUpperCase()}`)
  lines.push('')

  const creates = plan.changes.filter((c) => c.type === 'CREATE')
  if (creates.length > 0) {
    lines.push('CREATE')
    for (const c of creates) {
      lines.push(`  ${c.after?.name ?? c.resourceId}`)
    }
    lines.push('')
  }

  for (const f of plan.findings) {
    const label = SEV_LABEL[f.severity] ?? f.severity.toUpperCase()
    lines.push(`${label}  ${f.ruleId}`)
    lines.push(`  ${f.message}`)
    if (f.explanation) {
      lines.push('')
      lines.push(`  What: ${f.explanation.explanation}`)
      lines.push(`  Blast radius: ${f.explanation.blastRadius}`)
      lines.push('  Remediation:')
      for (const step of f.explanation.remediation) {
        lines.push(`    - ${step}`)
      }
    }
    lines.push('')
  }

  lines.push(`Plan: ${plan.planId}`)
  return lines.join('\n')
}

export function renderVerifySuccess(): string {
  return [
    'Plan valid.',
    '',
    'artifact: PASS',
    'target: PASS',
    'change set: PASS',
    '',
    'Status: READY',
  ].join('\n')
}

export function renderVerifyReplan(
  expectedTarget: string,
  actualTarget: string,
): string {
  return [
    'Plan validation failed.',
    '',
    'Expected target fingerprint:',
    expectedTarget,
    '',
    'Current target fingerprint:',
    actualTarget,
    '',
    'Status:',
    'REPLAN_REQUIRED',
    '',
    'No mutation performed.',
  ].join('\n')
}
