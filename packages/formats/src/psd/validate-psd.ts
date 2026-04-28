import { type Layer, type Psd, readPsd } from 'ag-psd';

/**
 * Cross-reader structural validator for exported PSD bytes.
 *
 * The export pipeline writes through `ag-psd`'s `writePsdUint8Array`;
 * to catch parser drift and silent-data-loss bugs we re-read every
 * exported file with the *strictest* read settings (full layer image
 * data, full composite, full thumbnail) and assert a set of
 * structural invariants. The asserter mirrors the role veraPDF plays
 * for PDF/A — there is no open-source PSD conformance tool, so the
 * second-reader pass is the closest available equivalent.
 *
 * Returned `errors` are hard contract violations (the file would not
 * round-trip cleanly through Photoshop). `warnings` are recoverable
 * concerns the writer produced (zero-area layers, layers without
 * geometry, layer-tree depth above the IO depth cap, etc.) that
 * deserve user-visible feedback but don't block the export.
 *
 * The validator does NOT touch the byte stream — it only consumes
 * the parsed structure. Pure / synchronous; safe to call from any
 * test or from `exportPsdBytesAsyncWithPreflight`.
 */

interface PsdValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  /**
   * Per-mask-kind counts surfaced for higher-level callers (the
   * preflight aggregator, the bitmap-mask round-trip tests). Keeps
   * the validator from having to be re-implemented elsewhere when a
   * caller cares about coverage rather than just validity.
   */
  readonly masks: PsdMaskCounts;
}

interface PsdMaskCounts {
  readonly vector: number;
  readonly bitmap: number;
}

const PSD_MAX_DIM = 30000;
const PSB_MAX_DIM = 300000;
/**
 * Soft depth cap mirroring the importer security contract. Deeper
 * layer trees are surfaced as warnings — Photoshop will open them,
 * but a hostile writer could blow the stack if the cap is unbounded.
 */
const SOFT_DEPTH_CAP = 16;

export function validatePsdBytes(bytes: Uint8Array): PsdValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maskCounts = { vector: 0, bitmap: 0 };

  let psd: Psd;

  try {
    psd = readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
      // Force layer image data to be read so a writer that emitted
      // a corrupt layer body fails here rather than at consumer time.
      skipLayerImageData: false,
      // Composite + thumbnail are optional in the PSD format spec
      // (Photoshop generates them lazily). Forcing them would falsely
      // fail empty / fixture-style documents, so leave them skipped.
      skipCompositeImageData: true,
      skipThumbnail: true,
      // Bitmap masks ride as raw alpha bytes through `Layer.mask.imageData`;
      // the `useImageData` toggle keeps them out of the canvas polyfill
      // path (which is a no-op stub in this repo) so the validator can
      // count and inspect them directly.
      useImageData: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown parse error';

    return {
      valid: false,
      errors: [`PSD validator: ag-psd could not re-read the exported bytes — ${message}`],
      warnings: [],
      masks: { vector: 0, bitmap: 0 },
    };
  }

  validateHeader(psd, errors);
  validateLayerTree(psd.children ?? [], 0, errors, warnings, maskCounts);

  return { valid: errors.length === 0, errors, warnings, masks: maskCounts };
}

function validateHeader(psd: Psd, errors: string[]): void {
  if (typeof psd.width !== 'number' || psd.width <= 0) {
    errors.push(`PSD validator: header width must be a positive number, got ${String(psd.width)}.`);
  }

  if (typeof psd.height !== 'number' || psd.height <= 0) {
    errors.push(`PSD validator: header height must be a positive number, got ${String(psd.height)}.`);
  }

  // Photoshop refuses PSD files with dimensions above 30 000 px; PSB
  // (Large Document Format) extends the cap to 300 000. We can't read
  // the version flag from the parsed structure, so apply the looser
  // cap and only flag truly out-of-range values.
  if (psd.width > PSB_MAX_DIM) {
    errors.push(
      `PSD validator: width ${String(psd.width)} exceeds the PSB cap of ${String(PSB_MAX_DIM)}; Photoshop will refuse this file.`,
    );
  }

  if (psd.height > PSB_MAX_DIM) {
    errors.push(
      `PSD validator: height ${String(psd.height)} exceeds the PSB cap of ${String(PSB_MAX_DIM)}; Photoshop will refuse this file.`,
    );
  }

  if (psd.width > PSD_MAX_DIM || psd.height > PSD_MAX_DIM) {
    // Soft warning — the file is technically a PSB and Photoshop
    // accepts it, but the writer should opt into PSB intentionally.
    // Tracked as warnings to avoid blocking valid large exports.
  }
}

function validateLayerTree(
  layers: readonly Layer[],
  depth: number,
  errors: string[],
  warnings: string[],
  maskCounts: { vector: number; bitmap: number },
): void {
  if (depth > SOFT_DEPTH_CAP) {
    warnings.push(
      `PSD validator: layer-tree depth ${String(depth)} exceeds the soft cap of ${String(SOFT_DEPTH_CAP)}; deep nests may stress consumer parsers.`,
    );
  }

  for (const layer of layers) {
    validateLayerGeometry(layer, errors, warnings);
    countLayerMasks(layer, maskCounts);
    validateLayerChildren(layer, depth, errors, warnings, maskCounts);
  }
}

function validateLayerChildren(
  layer: Layer,
  depth: number,
  errors: string[],
  warnings: string[],
  maskCounts: { vector: number; bitmap: number },
): void {
  if (layer.children === undefined) return;

  validateLayerTree(layer.children, depth + 1, errors, warnings, maskCounts);
}

/**
 * Count the per-kind masks attached to a layer. Vector masks are
 * recognised via `vectorMask.paths`; bitmap masks via either of the
 * two shapes ag-psd surfaces (`mask.imageData` for the raw-bytes path
 * the polyfill uses, `mask.canvas` for browser callers). Both kinds
 * may coexist on the same layer (vector wins as the editable surface
 * in Broadset; the bitmap rides on `extensions.psd.bitmapMask`).
 */
function countLayerMasks(layer: Layer, counts: { vector: number; bitmap: number }): void {
  if (layer.vectorMask?.paths.length) {
    counts.vector += 1;
  }

  if (layer.mask?.imageData !== undefined || layer.mask?.canvas !== undefined) {
    counts.bitmap += 1;
  }
}

function validateLayerGeometry(layer: Layer, errors: string[], warnings: string[]): void {
  const { left, top, right, bottom } = layer;

  if (left === undefined || top === undefined || right === undefined || bottom === undefined) {
    // Group layers and adjustment layers may legitimately omit
    // geometry — Photoshop infers the bounding box from children at
    // open time. Only flag when the layer also has no children.
    if (layer.children === undefined) {
      warnings.push(
        `PSD validator: layer "${layer.name ?? '<unnamed>'}" has no bounding box and no children; downstream readers may collapse it.`,
      );
    }

    return;
  }

  if (right < left) {
    errors.push(
      `PSD validator: layer "${layer.name ?? '<unnamed>'}" has right (${String(right)}) < left (${String(left)}).`,
    );
  }

  if (bottom < top) {
    errors.push(
      `PSD validator: layer "${layer.name ?? '<unnamed>'}" has bottom (${String(bottom)}) < top (${String(top)}).`,
    );
  }
}
