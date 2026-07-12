/// <reference types="node" />
import { defineConfig, devices } from '@playwright/experimental-ct-react';

import { createCtLogger } from './playwright-ct-logger';

export default defineConfig({
  testDir: './ct',
  testMatch: ['**/*.ct.tsx'],
  snapshotDir: './ct/__snapshots__',
  reporter: [['list']],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  // Mirror CI's flake-tolerance locally too: timing-variant CT retries once before failing, so the
  // local pre-push gate predicts CI instead of failing on transient flakes CI would have absorbed.
  retries: 1,
  timeout: 30_000,
  ...(process.env['CI'] ? { workers: 2 } : {}),
  expect: {
    timeout: 5_000,
  },
  use: {
    ctPort: 3100,
    ctViteConfig: {
      resolve: {
        conditions: ['import', 'module', 'browser', 'default'],
      },
      customLogger: createCtLogger(),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
