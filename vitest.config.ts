import { defineConfig } from 'vitest/config';

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
  },
});
