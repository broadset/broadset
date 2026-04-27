import { type BroadsetDocument, createEmptyBroadsetDocument } from '@broadset/model';

import type { DocumentImportResult } from '../import-document-types';
import { importPsd } from './import';

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
export function importPsdDocument(data: Uint8Array): DocumentImportResult {
  if (!looksLikePsd(data)) {
    return { document: createEmptyBroadsetDocument(), warnings: [INVALID_PSD_WARNING] };
  }

  let document: BroadsetDocument;

  try {
    document = importPsd(data);
  } catch {
    return { document: createEmptyBroadsetDocument(), warnings: [MALFORMED_PSD_WARNING] };
  }

  const warnings: string[] = [];

  if (document.elements.length === 0) {
    warnings.push(EMPTY_RESULT_WARNING);
  }

  return { document, warnings };
}
