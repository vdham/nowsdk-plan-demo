import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Exclude pure type/interface files — v8 reports 0% for them
      // because TypeScript erases types at runtime, which is
      // misleading rather than a real coverage gap.
      exclude: ['src/model/change.ts'],
      reporter: ['text', 'text-summary'],
    },
  },
})
