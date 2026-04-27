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
  },
});
