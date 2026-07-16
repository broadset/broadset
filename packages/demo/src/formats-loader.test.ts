import { beforeEach, describe, expect, it } from 'vitest';

import { loadFormats, resetFormatsCache } from './formats-loader';

describe('formats loader', () => {
  beforeEach(() => {
    resetFormatsCache();
  });

  it('loads and caches the formats package', async () => {
    const first = await loadFormats();
    const second = await loadFormats();

    expect(first).toBe(second);
    expect(first.exportBspPackageV1).toBeTypeOf('function');
  });
});
