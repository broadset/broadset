import { describe, expect, it, vi } from 'vitest';

import { createResourceCollectorV1 } from '../../v1';
import { createSvgImageAssetRegistryV1 } from './map-element';

describe('SVG image asset registry', () => {
  it('decodes, copies, and hashes a cloned image reference only once', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    try {
      const registry = createSvgImageAssetRegistryV1(createResourceCollectorV1(), 32 * 1024 * 1024);
      const reference = 'data:image/png;base64,AQID';
      const resolved = await Promise.all(
        Array.from({ length: 1_000 }, () => registry.resolve(reference, [1, 1])),
      );

      expect(new Set(resolved.map(({ assetId }) => assetId)).size).toBe(1);
      expect(digest).toHaveBeenCalledOnce();
    } finally {
      digest.mockRestore();
    }
  });

  it('rejects unique decoded images beyond the cumulative retained-resource budget', async () => {
    const registry = createSvgImageAssetRegistryV1(createResourceCollectorV1(), 3);
    const first = await registry.resolve('data:image/png;base64,AQID', [1, 1]);
    const rejected = await registry.resolve('data:image/png;base64,BAUG', [1, 1]);

    expect(first.limitExceeded).toBe(false);
    expect(rejected.limitExceeded).toBe(true);
  });
});
