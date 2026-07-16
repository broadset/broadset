import { describe, expect, it, vi } from 'vitest';

import { createResourceCollectorV1 } from '../../v1';
import { createPdfImageAssetRegistryV1 } from './map-image';
import type { ParsedPdfPageV1, PdfImageResourceV1, PdfImageUseV1 } from './types';

const IDENTITY: PdfImageUseV1['transform'] = [1, 0, 0, 1, 0, 0];

describe('PDF image asset registry', () => {
  it('registers one asset promise per image resource and one shared placeholder', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    try {
      const resource: PdfImageResourceV1 = {
        bytes: new Uint8Array([1, 2, 3]),
        mediaType: 'image/jpeg',
        pixelSize: [1, 1],
        warnings: [],
      };
      const page: ParsedPdfPageV1 = {
        width: 1,
        height: 1,
        mediaBoxX: 0,
        mediaBoxY: 0,
        textItems: [],
        fontNames: new Map(),
        paths: [],
        imageUses: [],
        images: new Map([
          ['AliasA', resource],
          ['AliasB', resource],
        ]),
        warnings: [],
      };
      const registry = createPdfImageAssetRegistryV1(page, createResourceCollectorV1());
      const uses: readonly PdfImageUseV1[] = [
        { resourceName: 'AliasA', transform: IDENTITY },
        { resourceName: 'AliasB', transform: IDENTITY },
        { resourceName: 'AliasA', transform: IDENTITY },
        { resourceName: 'MissingA', transform: IDENTITY },
        { resourceName: 'MissingB', transform: IDENTITY },
      ];
      const [aliasA, aliasB, repeated, placeholderA, placeholderB] = await Promise.all(
        uses.map((use) => registry.resolve(use)),
      );

      expect(aliasA).toBe(aliasB);
      expect(aliasA).toBe(repeated);
      expect(placeholderA).toBe(placeholderB);
      expect(digest).toHaveBeenCalledTimes(2);
    } finally {
      digest.mockRestore();
    }
  });
});
