import type { Layer } from 'ag-psd';
import { writePsdUint8Array } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { importPsdDocument } from './import-document';

function buildSolidLayer(name: string, w: number, h: number): Layer {
  const data = new Uint8Array(w * h * 4);

  for (let i = 0; i < w * h; i++) {
    const offset = i * 4;

    data[offset] = 200;
    data[offset + 1] = 200;
    data[offset + 2] = 200;
    data[offset + 3] = 255;
  }

  return {
    name,
    left: 0,
    top: 0,
    right: w,
    bottom: h,
    opacity: 1,
    hidden: false,
    imageData: { width: w, height: h, data },
  };
}

function buildNestedGroup(depth: number): Layer {
  if (depth <= 0) {
    return buildSolidLayer('leaf', 4, 4);
  }

  return {
    name: `group-${String(depth)}`,
    opened: true,
    children: [buildNestedGroup(depth - 1)],
  };
}

/**
 * @description The PSD importer enforces a byte-budget cap before
 * ag-psd's reader fires. Closes the 2026-04-28 production-readiness
 * audit finding that `PsdImportOptions.maxBytes` was declared but
 * never enforced.
 */
describe('PSD importer — parser-boundary caps', () => {
  /**
   * @description Inputs above the configured byte cap MUST be
   * rejected before the ag-psd parser allocates structures.
   */
  it('rejects input exceeding maxBytes before parsing', () => {
    const oversized = new Uint8Array(2 * 1024);

    oversized.set([0x38, 0x42, 0x50, 0x53]); // 8BPS header

    const result = importPsdDocument(oversized, { maxBytes: 1024 });

    expect(result.warnings.some((w) => /maxBytes|byte|cap/i.test(w))).toBe(true);
    expect(result.document.elements.length).toBe(0);
  });

  /**
   * @description Closes the 2026-04-28 audit follow-up: the layer
   * tree depth cap MUST fire when nesting exceeds `maxDepth`. Layers
   * past the cap are dropped and a warning surfaces so the user
   * knows the import is partial.
   */
  it('emits a warning when the layer-tree depth cap is exceeded', () => {
    const psdBytes = writePsdUint8Array({
      width: 32,
      height: 32,
      channels: 4,
      bitsPerChannel: 8,
      colorMode: 3,
      children: [buildNestedGroup(6)],
    });
    const result = importPsdDocument(psdBytes, { maxDepth: 2 });

    expect(result.warnings.some((w) => /depth/i.test(w))).toBe(true);
  });

  /**
   * @description Closes the 2026-04-28 audit follow-up: the
   * cumulative-pixel cap MUST fire and stop importing additional
   * raster layers once the running total crosses the budget.
   */
  it('emits a warning when the total-pixel cap is exceeded', () => {
    const psdBytes = writePsdUint8Array({
      width: 64,
      height: 64,
      channels: 4,
      bitsPerChannel: 8,
      colorMode: 3,
      children: [buildSolidLayer('a', 64, 64), buildSolidLayer('b', 64, 64), buildSolidLayer('c', 64, 64)],
    });
    // Cap of 4096 = 64×64; the first layer fits exactly, the second
    // pushes the running total past the cap and the third is
    // dropped with a warning.
    const result = importPsdDocument(psdBytes, { maxTotalPixels: 4096 });

    expect(result.warnings.some((w) => /pixel/i.test(w))).toBe(true);
  });
});
