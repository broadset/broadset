import { fileURLToPath } from 'node:url';

import type { ViteUserConfig } from 'vitest/config';

type VitestEnvironment = 'node' | 'jsdom';

export interface BroadsetVitestOptions {
  readonly environment: VitestEnvironment;
}

const styleMockPath = fileURLToPath(new URL('./test/mocks/styleMock.js', import.meta.url));
const fileMockPath = fileURLToPath(new URL('./test/mocks/fileMock.js', import.meta.url));
const setupFilePath = fileURLToPath(new URL('./test/vitest.setup.ts', import.meta.url));

/**
 * Shared Vitest config factory used by every package's vitest.config.ts.
 *
 * `globals: false` matches the repo's explicit-imports stance and keeps the
 * `@types/jest` ambient globals from needing a replacement in every tsconfig.
 * The codemod adds `import { describe, it, expect, ... } from 'vitest'` to
 * files that previously relied on Jest's implicit globals.
 * `setupFiles` is only attached for jsdom environments — node tests don't need
 * jest-dom matchers, TextEncoder polyfills, or the SVG geometry shim.
 */
export const createVitestConfig = ({ environment }: BroadsetVitestOptions): ViteUserConfig => ({
  resolve: {
    alias: [
      { find: /\.(css|less|scss)$/, replacement: styleMockPath },
      { find: /\.(svg|png|jpg|jpeg|gif|webp)$/, replacement: fileMockPath },
    ],
  },
  test: {
    environment,
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: environment === 'jsdom' ? [setupFilePath] : [],
    css: false,
    // Coverage instrumentation slows hot loops measurably; allow
    // longer timeouts when coverage is on so the SVG fan-out / large-
    // deck stress tests don't false-fail under v8 instrumentation.
    testTimeout: process.env['VITEST_COVERAGE'] === '1' ? 60_000 : 5_000,
    /*
     * V8-backed coverage collection. Coverage is **opt-in** via
     * `VITEST_COVERAGE=1` so the default `npm run test` path stays
     * fast; `npm run test:coverage` flips it on at the workspace
     * root. Reporter set: `text-summary` (stdout snapshot),
     * `json-summary` (machine-readable for tooling and the
     * `coverage-baseline.md` doc), and `html` (browseable locally).
     * Coverage output is gitignored — see `.gitignore`.
     */
    coverage: {
      provider: 'v8',
      enabled: process.env['VITEST_COVERAGE'] === '1',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
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
  },
});
