import type { Change } from '../model/change.js'
import type { Finding } from '../model/finding.js'

const RULE_ID = 'SN-BR-011'
const CATEGORY = 'EXECUTION_BEHAVIOR'

function attr(a: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = a?.[key]
  return typeof v === 'string' ? v : undefined
}

export function evaluateBusinessRuleExecution(change: Change): Finding[] {
  if (change.resourceType !== 'business_rule') return []
  if (change.type !== 'MODIFY') return []

  const whenBefore = attr(change.before?.attributes, 'when')
  const whenAfter = attr(change.after?.attributes, 'when')
  const execBefore = attr(change.before?.attributes, 'execution')
  const execAfter = attr(change.after?.attributes, 'execution')

  const afterToBefore = whenBefore === 'after' && whenAfter === 'before'
  const asyncToSync = execBefore === 'async' && execAfter === 'sync'

  if (!afterToBefore && !asyncToSync) return []

  const parts: string[] = []
  if (afterToBefore) parts.push(`when: ${whenBefore} -> ${whenAfter}`)
  if (asyncToSync) parts.push(`execution: ${execBefore} -> ${execAfter}`)

  return [
    {
      ruleId: RULE_ID,
      severity: 'medium',
      category: CATEGORY,
      resourceId: change.resourceId,
      message: parts.join('; '),
    },
  ]
}
