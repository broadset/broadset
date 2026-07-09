import {
  type BroadsetDocument,
  createEmptyBroadsetDocument,
  createPageElementInstanceForElement,
  ensureRootElementsHavePageInstances,
} from '@broadset/model';

import type { DocumentImportResult } from '../import-document';
import {
  capturePreservationBlobs,
  extractThirdPartyElementsWithBudget,
  hydrateDocumentFromFastPath,
  readDocumentXmp,
  readRoundTripMetadata,
} from './import/index';
import {
  collectEmbeddedFileNames,
  collectMarkedContentTags,
  hasEmbeddedJavaScript,
  probeLoadPdf,
} from './import/parse';
import type { MarkedContentTag, PdfImportOptions, PdfRoundTripMetadata } from './types';

/**
 * Warning surfaced when the byte stream does not look like a PDF file.
 */
const INVALID_PDF_WARNING =
  'PDF import failed: the input does not start with a %PDF- header and was not recognised as a PDF file.';

/**
 * Warning surfaced when pdf-lib rejects the byte stream — either
 * malformed bytes or a corrupted xref table.
 */
const MALFORMED_PDF_WARNING =
  'PDF import failed: pdf-lib could not parse the byte stream. The file may be malformed or truncated.';

/**
 * Warning surfaced when the PDF is encrypted and no password was
 * supplied. Parsing aborts before allocation per `project/spec/formats/pdf.md`
 * §"Security — Encrypted Input and Active Content".
 */
const ENCRYPTED_PDF_WARNING =
  'PDF import rejected: the document is encrypted. Provide the password via import options to proceed.';

/**
 * Warning surfaced when embedded JavaScript actions are detected on
 * the document catalog. The fast-path importer does not execute them
 * and strips them from the Broadset element tree; the warning tells
 * users what was removed so a silently-sanitised import is not
 * mistaken for a clean one.
 */
const JAVASCRIPT_STRIPPED_WARNING =
  'PDF import: embedded JavaScript actions were detected on the document catalog and have been stripped. The Broadset document will not execute them.';

/**
 * Warning surfaced when embedded-file streams (PDF file attachments)
 * are detected. The importer preserves their names in
 * `extensions.pdf.embeddedFiles` so re-export can surface them; the
 * warning names the files so users know to review them.
 */
function embeddedFilesWarning(names: readonly string[]): string {
  return `PDF import: ${String(names.length)} embedded file attachment(s) detected — names preserved as metadata, bytes dropped from this import: ${names.join(', ')}`;
}

/**
 * Warning surfaced when the third-party extraction pass finds no
 * operator-level content worth mapping.
 */
const EMPTY_THIRD_PARTY_WARNING =
  'PDF import: no broadset: XMP packet found and the operator extraction pass recovered no elements. The imported document is empty.';

/**
 * Warning surfaced alongside a third-party operator extraction. Coverage
 * is text-only today; shapes, images, and rich-text runs ride a future
 * iteration of the operator engine (Spec Gap in `project/spec/formats/pdf.md`).
 */
const THIRD_PARTY_PARTIAL_WARNING =
  'PDF import: no broadset: XMP packet — used operator-level text extraction (P6.4b). Raster images, vector paths / shapes, and rich-text runs are not yet mapped; Spec Gap in `project/spec/formats/pdf.md`.';

/**
 * Warning surfaced alongside a successful XMP + marked-content
 * hydration. Element geometry lands with the P6.4b operator-extraction
 * pass; until then elements carry placeholder position / size.
 */
const FAST_PATH_PLACEHOLDER_WARNING =
  'PDF import fast-path: hydrated document id + element ids + types from XMP and marked-content tags. Element geometry (position, width, height, rotation) will be recovered from the operator stream in Phase 6.4b.';

/**
 * Default byte cap for PDF input. 256 MiB covers every realistic
 * design-tool export while making a multi-GiB OOM bomb impossible.
 * Callers can override via `PdfImportOptions.maxBytes`; passing `0`
 * disables the cap for trusted internal flows.
 */
const DEFAULT_PDF_MAX_BYTES = 256 * 1024 * 1024;

/**
 * Default page-count cap. PDFs above this fire a warning and are
 * rejected before allocation. Real-world design-tool exports
 * comfortably fit within this; reports / books that legitimately
 * exceed it must opt-in via `PdfImportOptions.maxPages`.
 */
const DEFAULT_PDF_MAX_PAGES = 1024;

/**
 * Warning surfaced when the input exceeds the configured byte cap.
 */
function buildByteCapWarning(byteLength: number, cap: number): string {
  return `PDF import rejected: input size ${String(byteLength)} bytes exceeds the configured cap of ${String(cap)} bytes. Re-run with a higher \`maxBytes\` if you trust this file.`;
}

/**
 * Warning surfaced when the page count exceeds the configured cap.
 */
function buildPageCapWarning(pageCount: number, cap: number): string {
  return `PDF import rejected: page count ${String(pageCount)} exceeds the configured cap of ${String(cap)}. Re-run with a higher \`maxPages\` if you trust this file.`;
}

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
 * Layer the live operator-stream slices captured by
 * `capturePreservationBlobs` over the marked-content tags' optional
 * `/Blob` payloads. The captured operators take precedence — they
 * represent the actual bytes the PDF reader executed, which is what
 * a byte-stable re-export must re-emit. The static `/Blob` value (if
 * any) is only retained when no live capture matched the element id
 * so a third-party editor that scrubbed the content stream can still
 * round-trip a previously-stored preservation payload.
 */
function mergeOperatorBlobsIntoTags(
  tags: readonly MarkedContentTag[],
  blobs: ReadonlyMap<string, string>,
): readonly MarkedContentTag[] {
  return tags.map((tag) => {
    const captured = blobs.get(tag.id);

    if (captured === undefined) return tag;

    return { ...tag, preservationBlob: captured };
  });
}

function attachEmbeddedFilesExtension(doc: BroadsetDocument, fileNames: readonly string[]): BroadsetDocument {
  if (fileNames.length === 0) return doc;

  const existingExtensions = doc.extensions ?? {};
  const existingPdfExt = (existingExtensions['pdf'] as Record<string, unknown> | undefined) ?? {};
  const nextPdfExt = {
    ...existingPdfExt,
    embeddedFiles: fileNames,
  };
  const nextExtensions = {
    ...existingExtensions,
    pdf: nextPdfExt,
  };

  return { ...doc, extensions: nextExtensions };
}

/**
 * Import a PDF byte stream as a `BroadsetDocument`. Runs the XMP +
 * marked-content fast path (P6.4a) for Broadset-authored PDFs; arbitrary
 * third-party PDFs fall through to the operator-extraction pipeline
 * (P6.4b). Encrypted PDFs without a supplied password are rejected
 * before allocation per the importer security contract.
 */
export async function importPdfDocument(data: Uint8Array, options?: PdfImportOptions): Promise<DocumentImportResult> {
  if (!looksLikePdf(data)) {
    return { document: createEmptyBroadsetDocument(), warnings: [INVALID_PDF_WARNING] };
  }

  const maxBytes = options?.maxBytes ?? DEFAULT_PDF_MAX_BYTES;

  if (maxBytes > 0 && data.byteLength > maxBytes) {
    return { document: createEmptyBroadsetDocument(), warnings: [buildByteCapWarning(data.byteLength, maxBytes)] };
  }

  const loadResult = await probeLoadPdf(data, options ?? {});

  if (loadResult.kind === 'encrypted') {
    return { document: createEmptyBroadsetDocument(), warnings: [ENCRYPTED_PDF_WARNING] };
  }

  if (loadResult.kind === 'malformed') {
    return { document: createEmptyBroadsetDocument(), warnings: [MALFORMED_PDF_WARNING] };
  }

  const pdf = loadResult.pdf;
  const warnings: string[] = [];
  const maxPages = options?.maxPages ?? DEFAULT_PDF_MAX_PAGES;
  let pageCount: number;

  try {
    pageCount = pdf.getPageCount();
  } catch {
    return { document: createEmptyBroadsetDocument(), warnings: [MALFORMED_PDF_WARNING] };
  }

  if (maxPages > 0 && pageCount > maxPages) {
    return { document: createEmptyBroadsetDocument(), warnings: [buildPageCapWarning(pageCount, maxPages)] };
  }

  if (hasEmbeddedJavaScript(pdf)) {
    warnings.push(JAVASCRIPT_STRIPPED_WARNING);
  }

  const embeddedFileNames = collectEmbeddedFileNames(pdf);

  if (embeddedFileNames.length > 0) {
    warnings.push(embeddedFilesWarning(embeddedFileNames));
  }

  const xmp = readDocumentXmp(pdf);

  if (xmp === null) {
    const emptyDocument = createEmptyBroadsetDocument();
    const extraction = extractThirdPartyElementsWithBudget(pdf, emptyDocument.canvas, options?.maxOperatorBytes);

    warnings.push(...extraction.warnings);

    if (extraction.capExceeded) {
      warnings.push(
        `PDF import: operator-stream byte cap of ${String(extraction.capBytes)} reached. Some pages were not scanned for text; the imported document is partial. Re-run with a higher \`maxOperatorBytes\` if you trust this file.`,
      );
    }

    if (extraction.elements.length === 0) {
      warnings.push(EMPTY_THIRD_PARTY_WARNING);

      return { document: attachEmbeddedFilesExtension(emptyDocument, embeddedFileNames), warnings };
    }

    warnings.push(THIRD_PARTY_PARTIAL_WARNING);

    const allElements = [...emptyDocument.elements, ...extraction.elements];
    const rootInstances = allElements.filter((el) => el.parentId === null).map(createPageElementInstanceForElement);
    const pagesWithInstances = emptyDocument.pages.map((page, index) =>
      index === 0 ? { ...page, elements: rootInstances } : page,
    );

    return {
      document: attachEmbeddedFilesExtension(
        { ...emptyDocument, elements: allElements, pages: pagesWithInstances },
        embeddedFileNames,
      ),
      warnings,
    };
  }

  const tags = collectMarkedContentTags(pdf);
  const operatorBlobs = capturePreservationBlobs(pdf);
  const tagsWithLiveBlobs = mergeOperatorBlobsIntoTags(tags, operatorBlobs);
  const document = hydrateDocumentFromFastPath(xmp.documentId, tagsWithLiveBlobs, {
    pdfa: xmp.pdfa,
    xmpEntries: xmp.elements,
  });

  warnings.push(FAST_PATH_PLACEHOLDER_WARNING);

  return {
    document: ensureRootElementsHavePageInstances(attachEmbeddedFilesExtension(document, embeddedFileNames)),
    warnings,
  };
}

/**
 * Inspect a PDF byte stream and report whether Broadset can round-trip
 * its contents without data loss — true iff the document catalog carries
 * a valid `broadset:` XMP packet. Encrypted and malformed PDFs return
 * `false` so callers never mistake rejection for lossless round-trip.
 */
export async function canRoundTrip(data: Uint8Array): Promise<boolean> {
  if (!looksLikePdf(data)) return false;

  const result = await probeLoadPdf(data);

  if (result.kind !== 'ok') return false;

  return readDocumentXmp(result.pdf) !== null;
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
