import { createEmptyBroadsetDocument } from '@broadset/model';

import type { DocumentImportResult } from '../import-document';
import { hydrateDocumentFromFastPath, loadPdf, readDocumentXmp, readRoundTripMetadata } from './import/index';
import { collectMarkedContentTags } from './import/parse';
import type { PdfImportOptions, PdfRoundTripMetadata } from './types';

/**
 * Warning surfaced when the byte stream does not look like a PDF file.
 */
const INVALID_PDF_WARNING =
  'PDF import failed: the input does not start with a %PDF- header and was not recognised as a PDF file.';

/**
 * Warning surfaced when the PDF carries no `broadset:` XMP packet — the
 * fast path is unavailable and the P6.4b operator-extraction pipeline
 * takes over.
 */
const NO_XMP_WARNING =
  'PDF import: no broadset: XMP packet found; arbitrary third-party PDF extraction lands in Phase 6.4b (pdf-support-plan.md §Phase 3b). The document is empty.';

/**
 * Warning surfaced alongside a successful XMP + marked-content
 * hydration. Element geometry lands with the P6.4b operator-extraction
 * pass; until then elements carry placeholder position / size.
 */
const FAST_PATH_PLACEHOLDER_WARNING =
  'PDF import fast-path: hydrated document id + element ids + types from XMP and marked-content tags. Element geometry (position, width, height, rotation) will be recovered from the operator stream in Phase 6.4b.';

/**
 * PDF file-header signature (ASCII "%PDF-").
 */
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_HEADER.length) return false;

  for (let i = 0; i < PDF_HEADER.length; i++) {
    if (bytes[i] !== PDF_HEADER[i]) return false;
  }

  return true;
}

/**
 * Import a PDF byte stream as a `BroadsetDocument`. Runs the XMP +
 * marked-content fast path (P6.4a) for Broadset-authored PDFs; arbitrary
 * third-party PDFs surface an explanatory warning and return an empty
 * document until the operator-extraction fallback (P6.4b) lands.
 */
export async function importPdfDocument(
  data: Uint8Array,
  _options?: PdfImportOptions,
): Promise<DocumentImportResult> {
  if (!looksLikePdf(data)) {
    return { document: createEmptyBroadsetDocument(), warnings: [INVALID_PDF_WARNING] };
  }

  const pdf = await loadPdf(data);

  if (pdf === null) {
    return { document: createEmptyBroadsetDocument(), warnings: [INVALID_PDF_WARNING] };
  }

  const xmp = readDocumentXmp(pdf);

  if (xmp === null) {
    return { document: createEmptyBroadsetDocument(), warnings: [NO_XMP_WARNING] };
  }

  const tags = collectMarkedContentTags(pdf);
  const document = hydrateDocumentFromFastPath(xmp.documentId, tags);

  return { document, warnings: [FAST_PATH_PLACEHOLDER_WARNING] };
}

/**
 * Inspect a PDF byte stream and report whether Broadset can round-trip
 * its contents without data loss — true iff the document catalog carries
 * a valid `broadset:` XMP packet. Third-party PDFs always return `false`
 * so callers never mistake best-effort import for lossless round-trip.
 */
export async function canRoundTrip(data: Uint8Array): Promise<boolean> {
  if (!looksLikePdf(data)) return false;

  const pdf = await loadPdf(data);

  if (pdf === null) return false;

  return readDocumentXmp(pdf) !== null;
}

/**
 * Extract preserved round-trip metadata (XMP packet + marked-content
 * tags) from a PDF byte stream. Used by the reconciliation pipeline
 * (P6.5) to diff current operator-level visual state against the
 * preserved XMP defaults.
 */
export async function readPdfRoundTripMetadata(data: Uint8Array): Promise<PdfRoundTripMetadata> {
  if (!looksLikePdf(data)) {
    return { xmp: null, markedContentTags: [] };
  }

  return await readRoundTripMetadata(data);
}
