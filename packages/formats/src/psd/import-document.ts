import {
  createEmptyBroadsetDocument,
  ensureRootElementsHavePageInstances,
} from '@broadset/model';

import type { DocumentImportResult } from '../import-document-types';
import { importPsdWithBudget, type PsdImportInternalResult } from './import';
import type { PsdImportOptions } from './types';

/**
 * Warning surfaced when the byte stream does not start with the PSD
 * file signature. Mirrors `INVALID_PDF_WARNING` so callers (the demo's
 * import dropzone, programmatic CLI users) see a uniform contract
 * across formats.
 */
const INVALID_PSD_WARNING =
  'PSD import failed: the input does not start with the 8BPS signature and was not recognised as a PSD file.';

/**
 * Warning surfaced when ag-psd rejects the byte stream — malformed
 * bytes, truncated trailer, or version other than 1/PSB-2.
 */
const MALFORMED_PSD_WARNING =
  'PSD import failed: ag-psd could not parse the byte stream. The file may be malformed or truncated.';

/**
 * Warning surfaced when the importer recovered no elements at all.
 * Either a structurally-empty PSD (nothing but a background) or a
 * file whose layer tree only contained types Broadset cannot map
 * (adjustment-only docs, smart-filter-only docs).
 */
const EMPTY_RESULT_WARNING =
  'PSD import: no elements were recovered. The file may be empty, contain only adjustment layers, or use features outside the current mapping coverage.';

/**
 * Default cap on PSD input bytes. Mirrors the SVG/PPTX defaults — a
 * 256 MiB ceiling covers every realistic Photoshop document while
 * making a multi-GiB OOM bomb impossible. Callers can override via
 * `PsdImportOptions.maxBytes`; passing `0` disables the cap for
 * trusted internal flows.
 */
const DEFAULT_PSD_MAX_BYTES = 256 * 1024 * 1024;

/**
 * PSD file-header signature: "8BPS" (Adobe Photoshop). PSB documents
 * also start with "8BPS" but advertise version 2 in the next two
 * bytes; we accept both and let ag-psd validate the version.
 */
const PSD_HEADER = [0x38, 0x42, 0x50, 0x53] as const;

function looksLikePsd(bytes: Uint8Array): boolean {
  if (bytes.length < PSD_HEADER.length) return false;

  for (let i = 0; i < PSD_HEADER.length; i++) {
    if (bytes[i] !== PSD_HEADER[i]) return false;
  }

  return true;
}

/**
 * Robust PSD entry point — never throws, always returns a defined
 * canvas, surfaces structured warnings for malformed input and
 * empty results.
 *
 * Mirrors the contract of `importPdfDocument` so the demo's import
 * pipeline and the cross-format parity tests can treat both formats
 * uniformly.
 */
export function importPsdDocument(data: Uint8Array, options?: PsdImportOptions): DocumentImportResult {
  if (!looksLikePsd(data)) {
    return { document: createEmptyBroadsetDocument(), warnings: [INVALID_PSD_WARNING] };
  }

  const maxBytes = options?.maxBytes ?? DEFAULT_PSD_MAX_BYTES;

  if (maxBytes > 0 && data.byteLength > maxBytes) {
    return {
      document: createEmptyBroadsetDocument(),
      warnings: [
        `PSD import rejected: input size ${String(data.byteLength)} bytes exceeds the configured cap of ${String(maxBytes)} bytes. Re-run with a higher \`maxBytes\` if you trust this file.`,
      ],
    };
  }

  let result: PsdImportInternalResult;

  try {
    result = importPsdWithBudget(data, {
      maxDepth: options?.maxDepth,
      maxTotalPixels: options?.maxTotalPixels,
    });
  } catch {
    return { document: createEmptyBroadsetDocument(), warnings: [MALFORMED_PSD_WARNING] };
  }

  const warnings: string[] = [...result.warnings];

  if (result.document.elements.length === 0) {
    warnings.push(EMPTY_RESULT_WARNING);
  }

  return { document: ensureRootElementsHavePageInstances(result.document), warnings };
}
