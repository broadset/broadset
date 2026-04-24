import { type BroadsetDocument, createEmptyBroadsetDocument } from '@broadset/model';

import type { DocumentImportResult } from '../import-document';
import type { PdfImportOptions, PdfRoundTripMetadata } from './types';

/**
 * Warning surfaced when P6.1's staged import returns an empty document.
 *
 * The pdf-lib + pdfjs-dist infrastructure lands in this unit; XMP and
 * marked-content extraction (P6.4a) and operator-level extraction (P6.4b)
 * replace this with real content in the next Phase 6 units. Until then the
 * importer is registered and safe to call — it validates the byte stream as
 * a PDF and reports what is missing.
 */
const STAGED_IMPORT_WARNING =
  'PDF import extraction lands in Phase 6.4 (pdf-support-plan.md §Phase 3). The document was recognised as a PDF but no elements were extracted.';

/**
 * Warning surfaced when the byte stream does not look like a PDF file.
 */
const INVALID_PDF_WARNING =
  'PDF import failed: the input does not start with a %PDF- header and was not recognised as a PDF file.';

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
 * Import a PDF byte stream as a `BroadsetDocument`.
 *
 * P6.1 registers the entry point and validates the byte stream as a PDF.
 * Operator-level extraction, XMP hydration, and marked-content tag
 * collection land in P6.4. The `Promise` return type is the stable P6.4
 * contract; the P6.1 body resolves synchronously via `Promise.resolve` to
 * avoid misleading eager callers that no async work is pending.
 */
export function importPdfDocument(
  data: Uint8Array,
  _options?: PdfImportOptions,
): Promise<DocumentImportResult> {
  if (!looksLikePdf(data)) {
    const empty = createEmptyBroadsetDocument();

    return Promise.resolve({ document: empty, warnings: [INVALID_PDF_WARNING] });
  }

  const document: BroadsetDocument = createEmptyBroadsetDocument();

  return Promise.resolve({ document, warnings: [STAGED_IMPORT_WARNING] });
}

/**
 * Inspect a PDF byte stream and report whether Broadset can round-trip its
 * contents without data loss.
 *
 * A round-trippable PDF carries a `broadset:` XMP packet on the document
 * catalog (IO-D-08) and `/BSET` marked-content tags around every element's
 * painting sequence. P6.1 has no pdfjs-dist parsing yet — the real XMP
 * probe lands in P6.4a. Until then this function returns `false` so callers
 * never assume a lossy best-effort import is a lossless round-trip.
 */
export function canRoundTrip(_data: Uint8Array): Promise<boolean> {
  return Promise.resolve(false);
}

/**
 * Extract the preserved round-trip metadata from a PDF byte stream.
 *
 * The real XMP packet and marked-content tag collection lands in P6.4; the
 * staged return here keeps the type surface callable without misleading
 * downstream reconciliation code into treating missing data as present.
 */
export function readPdfRoundTripMetadata(_data: Uint8Array): Promise<PdfRoundTripMetadata> {
  return Promise.resolve({ xmp: null, markedContentTags: [] });
}
