import type { PDFDocument } from 'pdf-lib';

import { readBroadsetXmp } from '../../_shared/xmp';
import { loadPdf, readDocumentXmp } from './parse';

/**
 * Result of a structural PDF/A-2b validation pass. Lists the per-rule
 * findings the in-tree validator can detect — XMP namespace presence,
 * `/OutputIntents` existence, trailer `/ID` array, and the absence of
 * forbidden features (encryption, JavaScript, LZW). veraPDF
 * integration lands as a separate Spec Gap; until then this validator
 * is the structural floor every PDF/A-mode export is regression-tested
 * against.
 */
export interface PdfAValidationResult {
  readonly valid: boolean;
  readonly violations: readonly string[];
}

/**
 * Validate a PDF byte stream against the structural PDF/A-2b
 * requirements the in-tree exporter emits. NOT a full ISO 19005-2
 * conformance check — see `project/spec/formats/pdf.md` § PDF/A-2b
 * Conformance Mode → Spec Gaps for the gap inventory.
 */
export async function validatePdfA2b(bytes: Uint8Array): Promise<PdfAValidationResult> {
  const violations: string[] = [];

  const pdf = await loadPdf(bytes);

  if (pdf === null) {
    return {
      valid: false,
      violations: ['pdf-lib could not load the byte stream — encrypted or malformed input'],
    };
  }

  validateXmpPdfaIdentifier(pdf, violations);

  // Re-serialise without object streams so structural surfaces
  // (catalog dict, trailer, /OutputIntents) appear as plain text we
  // can grep against. Re-serialising is cheap relative to a full
  // round-trip and is bounded by the original document size.
  const grepText = await serialiseForGrep(pdf);

  validateNoEncrypt(grepText, bytes, violations);
  validateNoLzw(grepText, bytes, violations);
  validateOutputIntentsPresent(grepText, violations);
  validateNoJavaScriptActions(grepText, violations);
  validateTrailerHasIdArray(grepText, violations);

  return { valid: violations.length === 0, violations };
}

/**
 * Validate just the PDF/A-related XMP identifiers from a serialised
 * XMP packet string. Callers who already have the XMP string in hand
 * use this to verify the packet without re-loading the PDF.
 */
export function validatePdfAXmpPacket(xmpString: string): PdfAValidationResult {
  const violations: string[] = [];
  const xmp = readBroadsetXmp(xmpString);

  if (xmp === null) {
    return {
      valid: false,
      violations: ['XMP string could not be parsed as a `broadset:` packet'],
    };
  }

  if (xmp.pdfa === undefined) {
    violations.push('XMP packet missing the `pdfaid:` identifier block');

    return { valid: false, violations };
  }

  if (xmp.pdfa.part !== '2') {
    violations.push(`pdfaid:part is "${xmp.pdfa.part}", expected "2"`);
  }

  if (xmp.pdfa.conformance !== 'B') {
    violations.push(`pdfaid:conformance is "${xmp.pdfa.conformance}", expected "B"`);
  }

  return { valid: violations.length === 0, violations };
}

async function serialiseForGrep(pdf: PDFDocument): Promise<string> {
  const bytes = await pdf.save({ useObjectStreams: false });

  return new TextDecoder('latin1').decode(bytes);
}

function validateXmpPdfaIdentifier(pdf: PDFDocument, violations: string[]): void {
  const xmp = readDocumentXmp(pdf);

  if (xmp === null) {
    violations.push('No `broadset:` XMP packet on the document catalog `/Metadata` stream');

    return;
  }

  if (xmp.pdfa === undefined) {
    violations.push('XMP packet missing the `pdfaid:` identifier block');

    return;
  }

  if (xmp.pdfa.part !== '2') {
    violations.push(`pdfaid:part is "${xmp.pdfa.part}", expected "2"`);
  }

  if (xmp.pdfa.conformance !== 'B') {
    violations.push(`pdfaid:conformance is "${xmp.pdfa.conformance}", expected "B"`);
  }
}

function validateNoEncrypt(grepText: string, originalBytes: Uint8Array, violations: string[]): void {
  if (grepText.includes('/Encrypt ') || rawTextOf(originalBytes).includes('/Encrypt ')) {
    violations.push('PDF carries an `/Encrypt` entry — encryption is forbidden under PDF/A-2b');
  }
}

function validateNoLzw(grepText: string, originalBytes: Uint8Array, violations: string[]): void {
  const pattern = /\/Filter\s+\/LZWDecode\b/;

  if (pattern.test(grepText) || pattern.test(rawTextOf(originalBytes))) {
    violations.push('PDF uses the `LZWDecode` filter — forbidden under PDF/A-2b');
  }
}

function validateOutputIntentsPresent(grepText: string, violations: string[]): void {
  if (!grepText.includes('/OutputIntents')) {
    violations.push('No `/OutputIntents` array on the document catalog');

    return;
  }

  if (!grepText.includes('/GTS_PDFA1')) {
    violations.push('`/OutputIntents` does not include a `/GTS_PDFA1` subtype entry');
  }
}

function validateNoJavaScriptActions(grepText: string, violations: string[]): void {
  if (/\/S\s+\/JavaScript\b/.test(grepText)) {
    violations.push('PDF carries a `/S /JavaScript` action — forbidden under PDF/A-2b');
  }
}

function validateTrailerHasIdArray(grepText: string, violations: string[]): void {
  if (!/trailer[\s\S]*?\/ID\s*\[/.test(grepText)) {
    violations.push('Trailer is missing an `/ID` array — required under PDF/A-2b');
  }
}

function rawTextOf(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}
