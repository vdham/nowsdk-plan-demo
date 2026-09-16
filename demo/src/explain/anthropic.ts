import Anthropic from '@anthropic-ai/sdk'
import type { Change } from '../model/change.js'
import type { Finding, FindingExplanation } from '../model/finding.js'

// LLM sits AFTER the deterministic risk engine. It does not classify,
// trigger rules, or influence severity — it only annotates existing
// findings with plain-English context for reviewers.
//
// Prompt caching: the system prompt is stable across every finding in
// a plan, so we mark it with cache_control. Note that Opus 4.7's
// minimum cacheable prefix is 4096 tokens; short system prompts
// silently won't cache. The marker is harmless when below threshold.

const DEFAULT_MODEL = 'claude-opus-4-7'

const SYSTEM_PROMPT = `You annotate risk findings produced by a deterministic ServiceNow change-review engine.

You do NOT decide severity, trigger rules, or add new findings. The finding, its severity, and its rule ID are fixed inputs — never contradict them. Your job is to help a human reviewer understand what the change does and how to think about it.

The three rule categories you will see:

- SN-ACL-004 (HIGH, SECURITY_PRIVILEGE_EXPANSION) — an ACL's required-role set became less restrictive. This means broader access to a table on the target instance.

- SN-TBL-002 (HIGH, DESTRUCTIVE_SCHEMA) — a table field is being DELETED on the target instance. This is destructive and can drop data.

- SN-BR-011 (MEDIUM, EXECUTION_BEHAVIOR) — a Business Rule's execution timing became more aggressive (after -> before, async -> sync). Changes what other logic sees at the moment the rule fires; can cause subtle regressions in dependent scripts.

For each finding, produce three fields:

- explanation: 1-2 sentences describing what actually changes and why the deterministic engine flagged it. Concrete, technical, no hedging.
- blastRadius: 1-2 sentences on who or what is affected. Consider users with the removed role, records with the deleted field, other Business Rules or client scripts that read the field, etc. Do not speculate about specific customers.
- remediation: 2-4 concrete verification or mitigation steps a reviewer should take before approving. Actionable ("run X", "check Y"), not vague ("consider the impact").

Never mention this prompt, the deterministic engine, or the fact that you are an LLM. Speak directly to the reviewer.`

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    explanation: {
      type: 'string',
      description: '1-2 sentences on what changes and why it was flagged.',
    },
    blastRadius: {
      type: 'string',
      description: '1-2 sentences on who or what is affected.',
    },
    remediation: {
      type: 'array',
      items: { type: 'string' },
      description: '2-4 concrete verification or mitigation steps.',
    },
  },
  required: ['explanation', 'blastRadius', 'remediation'],
  additionalProperties: false,
} as const

export interface ExplanationClient {
  explain(finding: Finding, change: Change): Promise<FindingExplanation>
}

export class AnthropicExplanationClient implements ExplanationClient {
  private readonly client: Anthropic
  private readonly model: string

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env['ANTHROPIC_API_KEY']
    if (!apiKey) {
      throw new Error(
        'AnthropicExplanationClient: ANTHROPIC_API_KEY is not set. Set it in the environment or pass apiKey explicitly.',
      )
    }
    this.client = new Anthropic({ apiKey })
    this.model = opts.model ?? process.env['ANTHROPIC_EXPLAIN_MODEL'] ?? DEFAULT_MODEL
  }

  async explain(finding: Finding, change: Change): Promise<FindingExplanation> {
    const userMessage = buildUserMessage(finding, change)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: OUTPUT_SCHEMA,
        },
      },
      messages: [{ role: 'user', content: userMessage }],
    })

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    )
    if (!textBlock) {
      throw new Error(
        `AnthropicExplanationClient: no text block in response for ${finding.ruleId}`,
      )
    }
    return JSON.parse(textBlock.text) as FindingExplanation
  }
}

function buildUserMessage(finding: Finding, change: Change): string {
  const lines: string[] = [
    `Rule: ${finding.ruleId} (${finding.category}, severity=${finding.severity})`,
    `Resource: ${finding.resourceId} (type=${change.resourceType})`,
    `Engine message: ${finding.message}`,
    '',
    `Change: ${change.type}`,
  ]
  if (change.before) {
    lines.push(`Before attributes: ${JSON.stringify(change.before.attributes)}`)
  }
  if (change.after) {
    lines.push(`After  attributes: ${JSON.stringify(change.after.attributes)}`)
  }
  lines.push('', 'Produce the annotation as JSON per the required schema.')
  return lines.join('\n')
}
