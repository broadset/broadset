import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';

import { createVitestConfig } from '../../vitest.base';

export default mergeConfig(
  createVitestConfig({ environment: 'jsdom' }),
  defineConfig({
    plugins: [react()],
    define: {
      'process.env.PATH_BOOL_DEV_ASSERTS': JSON.stringify('0'),
    },
  }),
);
