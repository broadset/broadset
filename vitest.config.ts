import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config — fans out into per-package projects. Coverage
 * is configured here (not on the per-project configs) because Vitest
 * 4.x's workspace/projects mode aggregates coverage at the root and
 * ignores per-project coverage settings. See
 * `project/implementation/coverage-reporting.md` for the full
 * rationale and the env-var (`VITEST_COVERAGE=1`) opt-in.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/model/vitest.config.ts',
      'packages/playback/vitest.config.ts',
      'packages/renderer/vitest.config.ts',
      'packages/editor/vitest.config.ts',
      'packages/formats/vitest.config.ts',
      'packages/ui/vitest.config.ts',
      'packages/demo/vitest.config.ts',
    ],
    // Coverage is gated on the env var so default `npm run test`
    // stays fast; `npm run test:coverage` flips it on.
    coverage: {
      provider: 'v8',
      enabled: process.env['VITEST_COVERAGE'] === '1',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/test-helpers*',
        '**/*-test-utils*',
        '**/*-test-helpers*',
        '**/testing/**',
        '**/__fixtures__/**',
        '**/_test-helpers/**',
        '**/vitest.config.ts',
        'vitest.base.ts',
        'packages/*/dist/**',
        'packages/*/ct/**',
        'packages/demo/playwright/**',
        'packages/demo/src/main.tsx',
        'packages/demo/src/sampleDocument.{ts,json}',
      ],
    },
    // Coverage instrumentation slows hot loops measurably; bump the
    // per-test timeout so coverage runs don't false-fail on the SVG
    // fan-out / large-deck stress tests that already pass under
    // normal `npm run test`.
    testTimeout: process.env['VITEST_COVERAGE'] === '1' ? 60_000 : 5_000,
  },
});
