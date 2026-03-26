import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/tests/**',
        'src/**/*.bench.ts',
        'src/**/index.ts',
        'src/**/*.interface.ts',
        'src/**/types.ts',
        'src/utilities/source-map-entry.ts',
        'src/serialization-result.ts',
        'src/quad-sorting-strategy.ts'
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70
      }
    },
    deps: {
      interopDefault: true
    }
  }
});
