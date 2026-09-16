import { BusinessRule } from '@servicenow/sdk/core'

// Desired Business Rule for the demo:
//   - when='before'. Target-v1 has when='after', so the diff produces a
//     MODIFY that triggers SN-BR-011 (MEDIUM execution behavior).
BusinessRule({
    $id: Now.ID['x_helloworld_state_change'],
    name: 'State Change',
    active: true,
    table: 'x_helloworld_tableone',
    when: 'before',
    script: Now.include('./state-change-br.server.js'),
})
