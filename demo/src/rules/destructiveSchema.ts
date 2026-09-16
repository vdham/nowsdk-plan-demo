import type { Change } from '../model/change.js'
import type { Finding } from '../model/finding.js'

const RULE_ID = 'SN-TBL-002'
const CATEGORY = 'DESTRUCTIVE_SCHEMA'

export function evaluateDestructiveSchema(change: Change): Finding[] {
  if (change.resourceType !== 'field') return []
  if (change.type !== 'DELETE') return []
  const name = change.before?.name ?? change.resourceId
  return [
    {
      ruleId: RULE_ID,
      severity: 'high',
      category: CATEGORY,
      resourceId: change.resourceId,
      message: `Delete field ${name}`,
    },
  ]
}
