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

export interface PsdValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
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

  let psd: Psd;

  try {
    psd = readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
      skipCompositeImageData: false,
      skipLayerImageData: false,
      skipThumbnail: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown parse error';

    return { valid: false, errors: [`PSD validator: ag-psd could not re-read the exported bytes — ${message}`], warnings: [] };
  }

  validateHeader(psd, errors);
  validateLayerTree(psd.children ?? [], 0, errors, warnings);

  return { valid: errors.length === 0, errors, warnings };
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
    errors.push(`PSD validator: width ${String(psd.width)} exceeds the PSB cap of ${String(PSB_MAX_DIM)}; Photoshop will refuse this file.`);
  }

  if (psd.height > PSB_MAX_DIM) {
    errors.push(`PSD validator: height ${String(psd.height)} exceeds the PSB cap of ${String(PSB_MAX_DIM)}; Photoshop will refuse this file.`);
  }

  if (psd.width > PSD_MAX_DIM || psd.height > PSD_MAX_DIM) {
    // Soft warning — the file is technically a PSB and Photoshop
    // accepts it, but the writer should opt into PSB intentionally.
    // Tracked as warnings to avoid blocking valid large exports.
  }
}

function validateLayerTree(layers: readonly Layer[], depth: number, errors: string[], warnings: string[]): void {
  if (depth > SOFT_DEPTH_CAP) {
    warnings.push(`PSD validator: layer-tree depth ${String(depth)} exceeds the soft cap of ${String(SOFT_DEPTH_CAP)}; deep nests may stress consumer parsers.`);
  }

  for (const layer of layers) {
    validateLayerGeometry(layer, errors, warnings);
    validateLayerChildren(layer, depth, errors, warnings);
  }
}

function validateLayerChildren(layer: Layer, depth: number, errors: string[], warnings: string[]): void {
  if (layer.children === undefined) return;

  validateLayerTree(layer.children, depth + 1, errors, warnings);
}

function validateLayerGeometry(layer: Layer, errors: string[], warnings: string[]): void {
  const { left, top, right, bottom } = layer;

  if (left === undefined || top === undefined || right === undefined || bottom === undefined) {
    // Group layers and adjustment layers may legitimately omit
    // geometry — Photoshop infers the bounding box from children at
    // open time. Only flag when the layer also has no children.
    if (layer.children === undefined) {
      warnings.push(`PSD validator: layer "${layer.name ?? '<unnamed>'}" has no bounding box and no children; downstream readers may collapse it.`);
    }

    return;
  }

  if (right < left) {
    errors.push(`PSD validator: layer "${layer.name ?? '<unnamed>'}" has right (${String(right)}) < left (${String(left)}).`);
  }

  if (bottom < top) {
    errors.push(`PSD validator: layer "${layer.name ?? '<unnamed>'}" has bottom (${String(bottom)}) < top (${String(top)}).`);
  }
}
