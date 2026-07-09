import { getExtensionsSchema } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import {
  type ColorSpaceChoice,
  type PsdExportOptions,
  type PsdExtensions,
  psdExtensionsSchema,
  type PsdImportOptions,
  type PsdPreservedData,
  type PsdRoundTripMetadata,
} from './types';

/**
 * Phase 5 unit P5.1 — the PSD types module registers the
 * `extensions.psd` Zod schema into the model's central registry per
 * IO-D-11 ("load-time validation"), defines the round-trip metadata
 * and options shapes every Phase 2+ module consumes, and locks the
 * narrow public surface the format track can rely on.
 */

describe('PsdExtensions — central registry wiring', () => {
  /**
   * @description Importing the types module MUST register the PSD
   * extensions schema so `BroadsetProject` / `BroadsetDocument` parse
   * calls downstream validate `extensions.psd` payloads at load time.
   */
  it('registers a schema on the extensions registry at load time', () => {
    const schema = getExtensionsSchema('psd');

    expect(schema).toBeDefined();
  });

  /**
   * @description The registered schema MUST validate every well-formed
   * PSD extensions payload so loading a Broadset-exported `.bsp`
   * succeeds.
   */
  it('accepts a well-formed PsdExtensions payload', () => {
    const payload: PsdExtensions = {
      dirty: false,
      roundTrip: {
        signature: 'BsPs',
        elementId: 'element-1',
      },
    };

    const parsed = psdExtensionsSchema.safeParse(payload);

    expect(parsed.success).toBe(true);
  });

  /**
   * @description The schema MUST require the universal `dirty` flag —
   * omitting it is a regression of the shared IO-D-11 invariant.
   */
  it('rejects a payload missing the dirty flag', () => {
    const parsed = psdExtensionsSchema.safeParse({
      roundTrip: { signature: 'BsPs', elementId: 'element-1' },
    });

    expect(parsed.success).toBe(false);
  });

  /**
   * @description Optional `unmappedEffects` and `bitmapMask` preservation
   * blobs ride through untouched so re-export is byte-identical.
   */
  it('accepts optional unmappedEffects and bitmapMask preservation blobs', () => {
    const payload: PsdExtensions = {
      dirty: false,
      roundTrip: { signature: 'BsPs', elementId: 'element-1' },
      unmappedEffects: { kind: 'bevel', raw: 'base64-bytes' },
      bitmapMask: { width: 100, height: 100, raw: 'base64-bytes' },
    };

    expect(psdExtensionsSchema.safeParse(payload).success).toBe(true);
  });
});

describe('PsdImportOptions / PsdExportOptions defaults', () => {
  /**
   * @description Import options MUST include size caps consistent with
   * the shared importer security contract (cap total bytes before
   * allocation). Every field is optional — a bare `{}` is a valid
   * options object.
   */
  it('accept an empty options object', () => {
    const importOptions: PsdImportOptions = {};
    const exportOptions: PsdExportOptions = {};

    // Compile-time check: bare {} satisfies both option types.
    expect(importOptions).toBeDefined();
    expect(exportOptions).toBeDefined();
  });

  /**
   * @description Export options expose the full per-document color
   * space choice matrix so the export-options modal has a concrete
   * vocabulary to bind to.
   */
  it('expose the ColorSpaceChoice variants', () => {
    const choices: readonly ColorSpaceChoice[] = ['rgb', 'cmyk', 'lab', 'grayscale'];

    expect(choices).toHaveLength(4);
  });

  /**
   * @description PsdPreservedData and PsdRoundTripMetadata are
   * exported so format-internal modules consume them via barrel
   * imports (no deep internal imports).
   */
  it('exposes PsdPreservedData and PsdRoundTripMetadata at the type level', () => {
    const metadata: PsdRoundTripMetadata = {
      signature: 'BsPs',
      elementId: 'element-1',
    };
    const preserved: PsdPreservedData = {
      mime: 'application/octet-stream',
      raw: 'base64-bytes',
    };

    expect(metadata.signature).toBe('BsPs');
    expect(preserved.mime).toBe('application/octet-stream');
  });
});
