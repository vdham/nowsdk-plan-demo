# Third-Party Notices

This project incorporates or is derived from the following third-party
software. The licenses for each are reproduced below.

## ServiceNow/sdk-examples — Hello World Sample

Portions of [`demo/app/`](demo/app/) are derived from the ServiceNow
Hello World SDK sample:

- **Upstream:** https://github.com/ServiceNow/sdk-examples/tree/main/hello-world-sample
- **License:** MIT

The following files were copied from the upstream sample and modified
for the demo scenario (adding a `priority` field, removing
`datetime_field`, adjusting the record definition):

- `demo/app/src/fluent/sample-table.now.ts`
- `demo/app/src/fluent/sample-table-record.now.ts`
- `demo/app/now.config.json` (scope identifiers preserved verbatim)

The following files were added by this project and are NOT from the
upstream sample:

- `demo/app/src/fluent/todo-read-acl.now.ts` — new
- `demo/app/src/fluent/state-change-br.now.ts` — new
- `demo/app/src/fluent/state-change-br.server.js` — new
- `demo/app/plan-explicit-deletes.json` — new
- `demo/app/package.json` — new (upstream uses a pnpm workspace catalog;
  this file pins concrete versions for a standalone `npm install`)

### Upstream MIT license (ServiceNow/sdk-examples)

```
MIT License

Copyright (c) 2024 ServiceNow

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Runtime dependencies

Runtime and dev dependencies of the demo (`@anthropic-ai/sdk`, `commander`,
`fast-xml-parser`, `tsx`, `typescript`, `vitest`, `@types/node`, and the
`@servicenow/sdk` toolchain used only by `demo/app/`) are declared in the
respective `package.json` files and installed by `npm install`. Each carries
its own license — see `node_modules/<pkg>/LICENSE` after installation, or
consult npmjs.com.
