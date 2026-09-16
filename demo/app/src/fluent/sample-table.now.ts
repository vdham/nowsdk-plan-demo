import { IntegerColumn, StringColumn, Table } from '@servicenow/sdk/core'

// Desired state for the demo:
//   - keep string_field, integer_field
//   - add priority (Change 1: CREATE)
//   - drop datetime_field (Change 2: DELETE — enforced via explicitDeletes)
export const x_helloworld_tableone = Table({
    name: 'x_helloworld_tableone',
    label: 'Example Table',
    schema: {
        string_field: StringColumn({ label: 'String Field', mandatory: true }),
        integer_field: IntegerColumn({ label: 'Integer Field', mandatory: true }),
        priority: IntegerColumn({ label: 'Priority' }),
    },
})
