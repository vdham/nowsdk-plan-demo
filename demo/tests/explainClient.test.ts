import { describe, it, expect, afterEach, vi } from 'vitest'
import { AnthropicExplanationClient, enrichFindings } from '../src/explain/index.js'
import type { ChangeSet } from '../src/model/change.js'
import type { Finding, FindingExplanation } from '../src/model/finding.js'

const SAMPLE_FINDING: Finding = {
  ruleId: 'SN-ACL-004',
  severity: 'high',
  category: 'SECURITY_PRIVILEGE_EXPANSION',
  resourceId: 'acl:x_helloworld_tableone_read',
  message: 'ACL roles: [x_helloworld.user] -> []',
}

const SAMPLE_CHANGESET: ChangeSet = {
  changes: [
    {
      type: 'MODIFY',
      resourceId: 'acl:x_helloworld_tableone_read',
      resourceType: 'acl',
      before: {
        id: 'acl:x_helloworld_tableone_read',
        type: 'acl',
        name: 'x_helloworld_tableone read',
        attributes: { roles: ['x_helloworld.user'] },
      },
      after: {
        id: 'acl:x_helloworld_tableone_read',
        type: 'acl',
        name: 'x_helloworld_tableone read',
        attributes: { roles: [] },
      },
    },
  ],
}

const SAMPLE_EXPLANATION: FindingExplanation = {
  explanation: 'ACL role list was cleared.',
  blastRadius: 'Anyone can now pass the ACL role check.',
  remediation: ['Verify intended', 'Restore roles if not'],
}

describe('AnthropicExplanationClient constructor', () => {
  const originalKey = process.env['ANTHROPIC_API_KEY']
  const originalModel = process.env['ANTHROPIC_EXPLAIN_MODEL']

  afterEach(() => {
    if (originalKey === undefined) delete process.env['ANTHROPIC_API_KEY']
    else process.env['ANTHROPIC_API_KEY'] = originalKey
    if (originalModel === undefined) delete process.env['ANTHROPIC_EXPLAIN_MODEL']
    else process.env['ANTHROPIC_EXPLAIN_MODEL'] = originalModel
  })

  it('throws a clear error when no API key is available', () => {
    delete process.env['ANTHROPIC_API_KEY']
    expect(() => new AnthropicExplanationClient()).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('accepts an explicit apiKey option', () => {
    delete process.env['ANTHROPIC_API_KEY']
    expect(() => new AnthropicExplanationClient({ apiKey: 'sk-test' })).not.toThrow()
  })

  it('falls back to ANTHROPIC_API_KEY from the environment', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-from-env'
    expect(() => new AnthropicExplanationClient()).not.toThrow()
  })

  it('honors ANTHROPIC_EXPLAIN_MODEL env var and opts.model', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test'
    process.env['ANTHROPIC_EXPLAIN_MODEL'] = 'claude-from-env'
    const fromEnv = new AnthropicExplanationClient() as unknown as { model: string }
    expect(fromEnv.model).toBe('claude-from-env')
    const overridden = new AnthropicExplanationClient({ model: 'claude-explicit' }) as unknown as {
      model: string
    }
    expect(overridden.model).toBe('claude-explicit')
  })
})

describe('AnthropicExplanationClient.explain', () => {
  it('sends a cache-marked system prompt and parses the JSON text block', async () => {
    const client = new AnthropicExplanationClient({ apiKey: 'sk-test', model: 'test-model' })
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(SAMPLE_EXPLANATION) }],
    })
    ;(client as unknown as { client: { messages: { create: typeof create } } }).client = {
      messages: { create },
    }

    const result = await client.explain(SAMPLE_FINDING, SAMPLE_CHANGESET.changes[0]!)
    expect(result).toEqual(SAMPLE_EXPLANATION)

    expect(create).toHaveBeenCalledOnce()
    const req = create.mock.calls[0]![0]
    expect(req.model).toBe('test-model')
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(req.messages[0].role).toBe('user')
    expect(req.messages[0].content).toContain('SN-ACL-004')
    expect(req.messages[0].content).toContain('Before attributes')
    expect(req.messages[0].content).toContain('After  attributes')
    expect(req.output_config.format.type).toBe('json_schema')
  })

  it('omits Before/After lines when the change side is missing', async () => {
    const client = new AnthropicExplanationClient({ apiKey: 'sk-test' })
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(SAMPLE_EXPLANATION) }],
    })
    ;(client as unknown as { client: { messages: { create: typeof create } } }).client = {
      messages: { create },
    }

    const createOnly = {
      type: 'CREATE' as const,
      resourceId: 'field:x.new',
      resourceType: 'field' as const,
      after: { id: 'field:x.new', type: 'field' as const, name: 'new', attributes: {} },
    }
    await client.explain({ ...SAMPLE_FINDING, resourceId: 'field:x.new' }, createOnly)
    const msg = create.mock.calls[0]![0].messages[0].content as string
    expect(msg).not.toContain('Before attributes')
    expect(msg).toContain('After  attributes')
  })

  it('throws when the response has no text block', async () => {
    const client = new AnthropicExplanationClient({ apiKey: 'sk-test' })
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'tool_use' }] })
    ;(client as unknown as { client: { messages: { create: typeof create } } }).client = {
      messages: { create },
    }
    await expect(
      client.explain(SAMPLE_FINDING, SAMPLE_CHANGESET.changes[0]!),
    ).rejects.toThrow(/no text block/)
  })
})

describe('enrichFindings', () => {
  it('annotates findings with matching changes and leaves orphans untouched', async () => {
    const orphan: Finding = {
      ...SAMPLE_FINDING,
      ruleId: 'SN-XX-999',
      resourceId: 'acl:no-such-change',
    }
    const client = {
      explain: vi.fn().mockResolvedValue(SAMPLE_EXPLANATION),
    }
    const result = await enrichFindings(
      [SAMPLE_FINDING, orphan],
      SAMPLE_CHANGESET,
      client,
    )
    expect(client.explain).toHaveBeenCalledOnce()
    expect(result[0]!.explanation).toEqual(SAMPLE_EXPLANATION)
    expect(result[1]!.explanation).toBeUndefined()
  })
})
