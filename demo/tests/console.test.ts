import { describe, it, expect } from 'vitest'
import { renderPlanConsole } from '../src/output/console.js'
import type { PlanReceipt } from '../src/model/plan.js'
import type { Finding } from '../src/model/finding.js'

const BASE: PlanReceipt = {
  schemaVersion: '0.1-demo',
  planId: 'pl_test01',
  artifactDigest: 'a',
  targetFingerprint: 't',
  rulesVersion: 'demo-1',
  resolverVersion: 'demo-1',
  changeSetDigest: 'cs',
  coverage: 'COMPLETE',
  summary: { create: 0, modify: 0, delete: 0, highestSeverity: 'none' },
  relevantRefs: [],
  changes: [],
  findings: [],
}

describe('renderPlanConsole', () => {
  it('renders LLM-annotated findings with What / Blast radius / Remediation lines', () => {
    const finding: Finding = {
      ruleId: 'SN-ACL-004',
      severity: 'high',
      category: 'SECURITY_PRIVILEGE_EXPANSION',
      resourceId: 'acl:x_t_read',
      message: 'ACL roles: [x.user] -> []',
      explanation: {
        explanation: 'The read ACL is now unrestricted.',
        blastRadius: 'Any authenticated user can read x_t.',
        remediation: ['Restore role', 'Confirm with app owner'],
      },
    }
    const out = renderPlanConsole({ ...BASE, findings: [finding] }, {
      appLabel: 'App',
      targetLabel: '/tmp/t.json',
    })
    expect(out).toContain('HIGH  SN-ACL-004')
    expect(out).toContain('What: The read ACL is now unrestricted.')
    expect(out).toContain('Blast radius: Any authenticated user')
    expect(out).toContain('- Restore role')
    expect(out).toContain('- Confirm with app owner')
  })

  it('falls back to the raw severity string when it is not in the label map', () => {
    // Cast through unknown to inject an unrecognized severity so we can
    // exercise the fallback branch without opening up the type.
    const finding = {
      ruleId: 'SN-XX-000',
      severity: 'critical',
      category: 'OTHER',
      resourceId: 'x:y',
      message: 'boom',
    } as unknown as Finding
    const out = renderPlanConsole({ ...BASE, findings: [finding] }, {
      appLabel: 'App',
      targetLabel: '/tmp/t.json',
    })
    expect(out).toContain('CRITICAL  SN-XX-000')
  })

  it('emits a CREATE section only when creates exist', () => {
    const withoutCreates = renderPlanConsole(BASE, { appLabel: 'App', targetLabel: 't' })
    expect(withoutCreates).not.toMatch(/\nCREATE\n/)

    const withCreates = renderPlanConsole(
      {
        ...BASE,
        summary: { ...BASE.summary, create: 1 },
        changes: [
          {
            type: 'CREATE',
            resourceId: 'field:x.new',
            resourceType: 'field',
            after: { id: 'field:x.new', type: 'field', name: 'new_field', attributes: {} },
          },
        ],
      },
      { appLabel: 'App', targetLabel: 't' },
    )
    expect(withCreates).toContain('\nCREATE\n')
    expect(withCreates).toContain('  new_field')
  })
})
