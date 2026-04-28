/// <reference types="node" />
import { defineConfig, devices } from '@playwright/experimental-ct-react';

import { createCtLogger } from './playwright-ct-logger';

export default defineConfig({
  testDir: './ct',
  testMatch: ['**/*.ct.tsx'],
  reporter: [['list']],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    ctPort: 3200,
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
