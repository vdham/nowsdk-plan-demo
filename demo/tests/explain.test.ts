import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPlan } from '../src/commands/plan.js'
import { enrichFindings, type ExplanationClient } from '../src/explain/index.js'
import { AnthropicExplanationClient } from '../src/explain/anthropic.js'
import type { Finding } from '../src/model/finding.js'
import type { Change, ChangeSet } from '../src/model/change.js'

const REPO = new URL('..', import.meta.url).pathname

class MockExplanationClient implements ExplanationClient {
  public calls: Array<{ ruleId: string; resourceId: string }> = []
  async explain(finding: Finding, _change: Change) {
    this.calls.push({ ruleId: finding.ruleId, resourceId: finding.resourceId })
    return {
      explanation: `Mock explanation for ${finding.ruleId}.`,
      blastRadius: `Mock blast radius for ${finding.resourceId}.`,
      remediation: [`Mock step 1 for ${finding.ruleId}`, `Mock step 2`],
    }
  }
}

describe('enrichFindings', () => {
  it('attaches an explanation to every finding that maps to a change', async () => {
    const changes: Change[] = [
      {
        type: 'DELETE',
        resourceId: 'field:x.y',
        resourceType: 'field',
        before: { id: 'field:x.y', type: 'field', name: 'y', attributes: {} },
      },
    ]
    const changeSet: ChangeSet = { changes }
    const findings: Finding[] = [
      {
        ruleId: 'SN-TBL-002',
        severity: 'high',
        category: 'DESTRUCTIVE_SCHEMA',
        resourceId: 'field:x.y',
        message: 'Delete field y',
      },
    ]
    const client = new MockExplanationClient()
    const enriched = await enrichFindings(findings, changeSet, client)
    expect(enriched).toHaveLength(1)
    expect(enriched[0]?.explanation).toBeDefined()
    expect(enriched[0]?.explanation?.explanation).toContain('SN-TBL-002')
    expect(client.calls).toEqual([{ ruleId: 'SN-TBL-002', resourceId: 'field:x.y' }])
  })

  it('leaves severity / message / ruleId untouched', async () => {
    const changes: Change[] = [
      {
        type: 'DELETE',
        resourceId: 'field:x.y',
        resourceType: 'field',
        before: { id: 'field:x.y', type: 'field', name: 'y', attributes: {} },
      },
    ]
    const findings: Finding[] = [
      {
        ruleId: 'SN-TBL-002',
        severity: 'high',
        category: 'DESTRUCTIVE_SCHEMA',
        resourceId: 'field:x.y',
        message: 'Delete field y',
      },
    ]
    const enriched = await enrichFindings(findings, { changes }, new MockExplanationClient())
    expect(enriched[0]?.severity).toBe('high')
    expect(enriched[0]?.message).toBe('Delete field y')
    expect(enriched[0]?.ruleId).toBe('SN-TBL-002')
  })
})

describe('AnthropicExplanationClient constructor', () => {
  it('throws a clear error when ANTHROPIC_API_KEY is not set', () => {
    const saved = process.env['ANTHROPIC_API_KEY']
    delete process.env['ANTHROPIC_API_KEY']
    try {
      expect(() => new AnthropicExplanationClient()).toThrow(/ANTHROPIC_API_KEY/)
    } finally {
      if (saved !== undefined) process.env['ANTHROPIC_API_KEY'] = saved
    }
  })
})

describe('runPlan with explain', () => {
  it('produces identical fingerprints with and without --explain', async () => {
    const dir1 = await mkdtemp(join(tmpdir(), 'sn-plan-'))
    const dir2 = await mkdtemp(join(tmpdir(), 'sn-plan-'))
    const planNoExplain = join(dir1, 'plan.json')
    const planExplain = join(dir2, 'plan.json')

    await runPlan({
      desired: { kind: 'fixture', path: join(REPO, 'fixtures/desired.json') },
      targetFixture: join(REPO, 'fixtures/target-v1.json'),
      out: planNoExplain,
    })

    await runPlan({
      desired: { kind: 'fixture', path: join(REPO, 'fixtures/desired.json') },
      targetFixture: join(REPO, 'fixtures/target-v1.json'),
      out: planExplain,
      explainClient: new MockExplanationClient(),
    })

    const p1 = JSON.parse(await readFile(planNoExplain, 'utf8'))
    const p2 = JSON.parse(await readFile(planExplain, 'utf8'))

    // Additive-only invariant: explanations do not alter fingerprints,
    // digests, planId, coverage, summary, or the change set.
    expect(p2.artifactDigest).toBe(p1.artifactDigest)
    expect(p2.targetFingerprint).toBe(p1.targetFingerprint)
    expect(p2.changeSetDigest).toBe(p1.changeSetDigest)
    expect(p2.planId).toBe(p1.planId)
    expect(p2.summary).toEqual(p1.summary)
    expect(p2.changes).toEqual(p1.changes)
    expect(p2.findings).toHaveLength(p1.findings.length)

    // Explanations are present in the enriched plan, absent in the other.
    expect(p1.findings.every((f: Finding) => f.explanation === undefined)).toBe(true)
    expect(p2.findings.every((f: Finding) => f.explanation !== undefined)).toBe(true)
  })
})
