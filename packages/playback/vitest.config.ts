import { defineConfig } from 'vitest/config';

import { createVitestConfig } from '../../vitest.base';

export default defineConfig(createVitestConfig({ environment: 'jsdom' }));
