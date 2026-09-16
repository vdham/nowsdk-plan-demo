import type { Change, ChangeSet } from '../model/change.js'
import type { Finding } from '../model/finding.js'
import type { ExplanationClient } from './anthropic.js'

export { AnthropicExplanationClient, type ExplanationClient } from './anthropic.js'

// Enriches each Finding with an LLM-generated annotation. Runs serial
// (not parallel) so prompt-cache hits on the shared system prompt can
// accrue from the second finding onward. See PRD/README.
export async function enrichFindings(
  findings: Finding[],
  changeSet: ChangeSet,
  client: ExplanationClient,
): Promise<Finding[]> {
  const changeById = new Map<string, Change>(
    changeSet.changes.map((c) => [c.resourceId, c]),
  )
  const enriched: Finding[] = []
  for (const finding of findings) {
    const change = changeById.get(finding.resourceId)
    if (!change) {
      enriched.push(finding)
      continue
    }
    const explanation = await client.explain(finding, change)
    enriched.push({ ...finding, explanation })
  }
  return enriched
}
