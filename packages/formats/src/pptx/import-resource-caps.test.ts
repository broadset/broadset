import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { importPptxDocument } from '../import-document';
import { exportPptxBytes } from './export';
import { importPptxWithReport } from './import';

/**
 * @description The PPTX importer enforces pre-decompression caps so a
 * ZIP bomb cannot exhaust memory before per-entry checks fire. Closes
 * the 2026-04-28 production-readiness audit finding "PPTX ZIP caps are
 * applied after full decompression and do not abort processing": the
 * caps are honoured at the central-directory header pass via fflate's
 * filter callback, before any compressed bytes are inflated.
 */
describe('PPTX importer — pre-decompression caps', () => {
  /**
   * @description An input that declares a single uncompressed-size
   * larger than the per-part cap MUST surface a `size-cap` warning and
   * MUST NOT contain that part in the imported package.
   */
  it('skips entries whose declared uncompressed size exceeds the per-part cap', () => {
    const oversizedBytes = new Uint8Array(2 * 1024 * 1024); // 2 MiB

    oversizedBytes.fill(0x41);

    const innocuous = new Uint8Array(8);
    const zipBytes = zipSync({
      'oversized.bin': oversizedBytes,
      'small.txt': innocuous,
    });
    const result = importPptxWithReport(zipBytes, { maxPartBytes: 1024 });
    const sizeCapWarnings = result.warnings.filter((w) => w.code === 'size-cap');

    expect(sizeCapWarnings.length).toBeGreaterThan(0);
    expect(sizeCapWarnings[0]?.detail).toBe('oversized.bin');
  });

  /**
   * @description A package with more than `maxEntries` entries MUST
   * surface an `entry-cap` warning and MUST drop the over-cap entries
   * from the loaded package.
   */
  it('skips entries past the entry-count cap', () => {
    const inputs: Record<string, Uint8Array> = {};

    for (let i = 0; i < 10; i++) {
      inputs[`part-${String(i)}.bin`] = new Uint8Array([1, 2, 3]);
    }

    const zipBytes = zipSync(inputs);
    const result = importPptxWithReport(zipBytes, { maxEntries: 3 });
    const entryCapWarnings = result.warnings.filter((w) => w.code === 'entry-cap');

    expect(entryCapWarnings.length).toBe(7);
  });

  /**
   * @description A package made of many individually-small entries can
   * still decompress beyond a safe aggregate budget. The importer MUST
   * enforce the cumulative uncompressed cap before inflating over-cap
   * entries.
   */
  it('skips entries that would exceed the total uncompressed-size cap', () => {
    const zipBytes = zipSync({
      'part-a.bin': new Uint8Array(8),
      'part-b.bin': new Uint8Array(8),
      'part-c.bin': new Uint8Array(8),
    });
    const result = importPptxWithReport(zipBytes, {
      maxPartBytes: 1024,
      maxTotalUncompressedBytes: 12,
    });
    const sizeCapWarnings = result.warnings.filter((w) => w.code === 'size-cap');

    expect(sizeCapWarnings.length).toBeGreaterThan(0);
    expect(sizeCapWarnings.some((w) => /total cap/i.test(w.message))).toBe(true);
  });

  /**
   * @description The public importer boundary must also surface cap
   * violations as user-visible warning strings rather than leaking ZIP
   * reader errors.
   */
  it('public import returns warnings for entry-count caps', async () => {
    const inputs: Record<string, Uint8Array> = {};

    for (let i = 0; i < 6; i++) {
      inputs[`part-${String(i)}.bin`] = new Uint8Array([1]);
    }

    const result = await importPptxDocument(zipSync(inputs), { maxEntries: 2 });

    expect(result.document).toBeDefined();
    expect(result.warnings.some((warning) => /entry-count cap/i.test(warning))).toBe(true);
  });

  /**
   * @description Entries within the configured caps MUST round-trip
   * cleanly without a cap warning so the new code path doesn't false-
   * positive on normal-shaped decks.
   */
  it('does not warn when a real PPTX export is within the configured caps', () => {
    const seed = {
      ...createEmptyBroadsetDocument(),
      elements: [createDefaultElement('rectangle', { id: 'rect-1' })],
    };
    const realPptxBytes = exportPptxBytes(seed);
    const result = importPptxWithReport(realPptxBytes, {
      maxInputBytes: 4 * 1024 * 1024,
      maxPartBytes: 1024 * 1024,
      maxEntries: 1024,
    });
    const capWarnings = result.warnings.filter((w) => w.code === 'size-cap' || w.code === 'entry-cap');

    expect(capWarnings.length).toBe(0);
  });
});
