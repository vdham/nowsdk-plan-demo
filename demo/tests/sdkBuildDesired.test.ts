import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPlan } from '../src/commands/plan.js'
import { runVerify } from '../src/commands/verify.js'
import { SdkBuildDesiredAdapter } from '../src/adapters/sdkBuildDesired.js'

const REPO = new URL('..', import.meta.url).pathname
const BUILD_DIR = join(REPO, 'app/dist')
const DELETES = join(REPO, 'app/plan-explicit-deletes.json')

// These tests depend on `now-sdk build` having been run in demo/app/.
// Skip gracefully if the build artifact is missing so `npm test` does
// not fail on a clean checkout.
const hasBuild = existsSync(join(BUILD_DIR, 'app/update'))

describe.skipIf(!hasBuild)('SdkBuildDesiredAdapter (real build)', () => {
  it('parses fields, ACL, and business rule from build XML', async () => {
    const adapter = new SdkBuildDesiredAdapter(BUILD_DIR, DELETES)
    const resources = await adapter.getResources()
    const byType = new Map<string, number>()
    for (const r of resources) byType.set(r.type, (byType.get(r.type) ?? 0) + 1)
    expect(byType.get('field')).toBeGreaterThanOrEqual(3)
    expect(byType.get('acl')).toBe(1)
    expect(byType.get('business_rule')).toBe(1)

    const priority = resources.find((r) => r.id === 'field:x_helloworld_tableone.priority')
    expect(priority?.attributes['type']).toBe('integer')

    const acl = resources.find((r) => r.type === 'acl')
    expect(acl?.id).toBe('acl:x_helloworld_tableone_read')
    expect(acl?.attributes['roles']).toEqual([])

    const br = resources.find((r) => r.type === 'business_rule')
    expect(br?.id).toBe('business_rule:x_helloworld_tableone_state_change')
    expect(br?.attributes['when']).toBe('before')
  })

  it('reads explicit deletes from sibling JSON', async () => {
    const adapter = new SdkBuildDesiredAdapter(BUILD_DIR, DELETES)
    const deletes = await adapter.getExplicitDeletes()
    expect(deletes).toContainEqual({
      id: 'field:x_helloworld_tableone.datetime_field',
      type: 'field',
    })
  })

  it('produces the same demo change summary as the fixture path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sn-plan-'))
    const planPath = join(dir, 'plan.json')
    await runPlan({
      desired: { kind: 'sdk-build', buildDir: BUILD_DIR, explicitDeletesPath: DELETES },
      targetFixture: join(REPO, 'fixtures/target-v1.json'),
      out: planPath,
    })
    const plan = JSON.parse(await readFile(planPath, 'utf8'))
    expect(plan.summary.create).toBe(1)
    expect(plan.summary.modify).toBe(2)
    expect(plan.summary.delete).toBe(1)
    expect(plan.summary.highestSeverity).toBe('high')
    expect(plan.findings.map((f: { ruleId: string }) => f.ruleId).sort()).toEqual([
      'SN-ACL-004',
      'SN-BR-011',
      'SN-TBL-002',
    ])

    const v1 = await runVerify({ plan: planPath, targetFixture: join(REPO, 'fixtures/target-v1.json') })
    expect(v1.status).toBe('READY')
    const v2 = await runVerify({ plan: planPath, targetFixture: join(REPO, 'fixtures/target-v2.json') })
    expect(v2.status).toBe('REPLAN_REQUIRED')
  })
})

// Self-contained coverage of the XML parsing branches. These tests
// don't require `now-sdk build` output — they synthesize the exact
// wire shape the SDK emits under app/dist/app/update/.
describe('SdkBuildDesiredAdapter (synthetic XML)', () => {
  let updateDir: string
  let root: string
  let deletesPath: string

  const files: Record<string, string> = {
    'field_string.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_dictionary">
  <sys_dictionary action="INSERT_OR_UPDATE">
    <name>x_test_table</name>
    <element>string_field</element>
    <internal_type>string</internal_type>
    <column_label>String Field</column_label>
    <mandatory>true</mandatory>
  </sys_dictionary>
</record_update>`,
    // element carried as an XML attribute rather than a child node.
    'field_attr.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_dictionary">
  <sys_dictionary action="INSERT_OR_UPDATE" element="attr_field">
    <name>x_test_table</name>
    <internal_type>integer</internal_type>
  </sys_dictionary>
</record_update>`,
    // element === "NULL" is how SN marks the whole-row dictionary
    // entry for a table; we skip it.
    'field_null.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_dictionary">
  <sys_dictionary action="INSERT_OR_UPDATE">
    <name>x_test_table</name>
    <element>NULL</element>
    <internal_type>collection</internal_type>
  </sys_dictionary>
</record_update>`,
    // missing internal_type → skip
    'field_missing.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_dictionary">
  <sys_dictionary action="INSERT_OR_UPDATE">
    <name>x_test_table</name>
    <element>ghost</element>
  </sys_dictionary>
</record_update>`,
    'acl_read.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_security_acl">
  <sys_security_acl action="INSERT_OR_UPDATE">
    <name>x_test_table</name>
    <operation>read</operation>
    <type>record</type>
  </sys_security_acl>
</record_update>`,
    // ACL missing operation → skip
    'acl_bad.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_security_acl">
  <sys_security_acl action="INSERT_OR_UPDATE">
    <name>x_test_table</name>
  </sys_security_acl>
</record_update>`,
    // ACL with type absent → defaults to 'record'
    'acl_notype.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_security_acl">
  <sys_security_acl action="INSERT_OR_UPDATE">
    <name>x_other_table</name>
    <operation>write</operation>
  </sys_security_acl>
</record_update>`,
    'br_before.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_script">
  <sys_script action="INSERT_OR_UPDATE">
    <collection>x_test_table</collection>
    <name>State Change</name>
    <when>before</when>
    <active>true</active>
  </sys_script>
</record_update>`,
    // BR with no when → defaults to 'before'
    'br_default.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_script">
  <sys_script action="INSERT_OR_UPDATE">
    <collection>x_test_table</collection>
    <name>Untimed Rule</name>
  </sys_script>
</record_update>`,
    // Unknown table (no DISPATCH entry) → skipped silently.
    'unknown_table.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="sys_something_else">
  <sys_something_else action="INSERT_OR_UPDATE">
    <foo>bar</foo>
  </sys_something_else>
</record_update>`,
    // Empty wrapper (no child element) → skipped.
    'empty_wrapper.xml': `<?xml version="1.0" encoding="UTF-8"?>
<record_update></record_update>`,
    // No record_update root → skipped.
    'no_root.xml': `<?xml version="1.0" encoding="UTF-8"?>
<other_root><foo>bar</foo></other_root>`,
    // Non-.xml files must be ignored by directory traversal.
    'readme.txt': 'not an xml file',
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'sn-sdkbuild-'))
    updateDir = join(root, 'app', 'update')
    await mkdir(updateDir, { recursive: true })
    for (const [name, body] of Object.entries(files)) {
      await writeFile(join(updateDir, name), body, 'utf8')
    }
    deletesPath = join(root, 'plan-explicit-deletes.json')
    await writeFile(
      deletesPath,
      JSON.stringify({
        explicitDeletes: [{ id: 'field:x_test_table.gone', type: 'field' }],
      }),
      'utf8',
    )
  })

  it('parses every supported record type, sorted by id, skipping invalid ones', async () => {
    const adapter = new SdkBuildDesiredAdapter(root, deletesPath)
    const resources = await adapter.getResources()
    // Should include: 2 valid fields, 2 valid ACLs, 2 valid business
    // rules. Everything else (NULL, missing internal_type, missing
    // operation, unknown table, empty wrapper, no root, .txt) is dropped.
    expect(resources.map((r) => r.id)).toEqual([
      'acl:x_other_table_write',
      'acl:x_test_table_read',
      'business_rule:x_test_table_state_change',
      'business_rule:x_test_table_untimed_rule',
      'field:x_test_table.attr_field',
      'field:x_test_table.string_field',
    ])
  })

  it('reads dictionary field attributes with typed defaults', async () => {
    const adapter = new SdkBuildDesiredAdapter(root, deletesPath)
    const resources = await adapter.getResources()
    const stringField = resources.find((r) => r.id === 'field:x_test_table.string_field')!
    expect(stringField.attributes).toEqual({
      table: 'x_test_table',
      type: 'string',
      label: 'String Field',
      mandatory: true,
    })
    // Field with element as @attribute + no column_label → label falls back to element name.
    const attrField = resources.find((r) => r.id === 'field:x_test_table.attr_field')!
    expect(attrField.attributes).toEqual({
      table: 'x_test_table',
      type: 'integer',
      label: 'attr_field',
      mandatory: false,
    })
  })

  it('reads ACLs with roles=[] and defaults type=record when missing', async () => {
    const adapter = new SdkBuildDesiredAdapter(root, deletesPath)
    const resources = await adapter.getResources()
    const readAcl = resources.find((r) => r.id === 'acl:x_test_table_read')!
    expect(readAcl.attributes).toEqual({
      table: 'x_test_table',
      operation: 'read',
      type: 'record',
      roles: [],
    })
    const writeAcl = resources.find((r) => r.id === 'acl:x_other_table_write')!
    expect(writeAcl.attributes['type']).toBe('record')
  })

  it('reads business rules, defaulting when to "before"', async () => {
    const adapter = new SdkBuildDesiredAdapter(root, deletesPath)
    const resources = await adapter.getResources()
    const named = resources.find((r) => r.id === 'business_rule:x_test_table_state_change')!
    expect(named.attributes).toMatchObject({ table: 'x_test_table', when: 'before', active: true })
    const untimed = resources.find((r) => r.id === 'business_rule:x_test_table_untimed_rule')!
    expect(untimed.attributes['when']).toBe('before')
    expect(untimed.attributes['active']).toBe(false)
  })

  it('returns explicit deletes from sibling JSON when present', async () => {
    const adapter = new SdkBuildDesiredAdapter(root, deletesPath)
    expect(await adapter.getExplicitDeletes()).toEqual([
      { id: 'field:x_test_table.gone', type: 'field' },
    ])
  })

  it('returns [] when the explicit-deletes file is absent (ENOENT swallowed)', async () => {
    const adapter = new SdkBuildDesiredAdapter(root, join(root, 'nope.json'))
    expect(await adapter.getExplicitDeletes()).toEqual([])
  })

  it('returns [] when the explicit-deletes file omits the "explicitDeletes" key', async () => {
    const emptyPath = join(root, 'empty-deletes.json')
    await writeFile(emptyPath, '{}', 'utf8')
    const adapter = new SdkBuildDesiredAdapter(root, emptyPath)
    expect(await adapter.getExplicitDeletes()).toEqual([])
  })

  it('rethrows non-ENOENT errors from the deletes file', async () => {
    const badPath = join(root, 'bad-deletes.json')
    await writeFile(badPath, '{not json', 'utf8')
    const adapter = new SdkBuildDesiredAdapter(root, badPath)
    await expect(adapter.getExplicitDeletes()).rejects.toThrow()
  })
})
