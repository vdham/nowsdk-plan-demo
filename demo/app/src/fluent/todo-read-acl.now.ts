import { Acl } from '@servicenow/sdk/core'

// Desired ACL for the demo:
//   - roles omitted (empty). Target-v1 has roles=['x_helloworld.user'],
//     so the diff produces a MODIFY that triggers SN-ACL-004 (HIGH).
Acl({
    $id: Now.ID['x_helloworld_tableone_read'],
    type: 'record',
    operation: 'read',
    table: 'x_helloworld_tableone',
    condition: 'active=true',
})
