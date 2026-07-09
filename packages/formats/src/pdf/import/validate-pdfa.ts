import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from 'pdf-lib';

import { readBroadsetXmp } from '../../_shared/xmp';
import { loadPdf, readDocumentXmp } from './parse';

/**
 * Result of a structural PDF/A-2b validation pass. Lists the per-rule
 * findings the in-tree validator can detect — XMP namespace presence,
 * `/OutputIntents` existence, trailer `/ID` array, and the absence of
 * forbidden features (encryption, JavaScript, LZW). Full ISO 19005-2
 * conformance is additionally checked in CI via Docker veraPDF
 * (`.github/workflows/verapdf.yml`) and locally via
 * `npm run validate:pdfa -w @broadset/formats`. This in-tree validator
 * is the fast structural floor unit tests use where Docker is too heavy.
 */
interface PdfAValidationResult {
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
  validateEmbeddedFontsHaveToUnicode(pdf, violations);
  validateNoTransparencyWithoutGroup(grepText, violations);

  return { valid: violations.length === 0, violations };
}

/**
 * ISO 19005-2 §6.2.11 — every embedded font that participates in
 * text-showing operators MUST carry a `/ToUnicode` CMap so PDF/A
 * readers can extract searchable, copyable Unicode text. Standard 14
 * fonts (Helvetica, Times, Courier, Symbol, ZapfDingbats) are
 * implicitly mapped via WinAnsi / Symbol / ZapfDingbats encodings and
 * do NOT require an explicit ToUnicode CMap. This is the structural
 * floor for both `2b` and `2u` validation in the in-tree validator.
 */
const TO_UNICODE_KEY = PDFName.of('ToUnicode');
const SUBTYPE_KEY = PDFName.of('Subtype');
const FONT_TYPE_KEY = PDFName.of('Type');
const FONT_DESCRIPTOR_KEY = PDFName.of('FontDescriptor');
const BASE_FONT_KEY = PDFName.of('BaseFont');
const STANDARD_FONT_BASES: ReadonlySet<string> = new Set([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
  'Symbol',
  'ZapfDingbats',
]);

// CIDFontType0 / CIDFontType2 are descendant fonts referenced from a
// parent /Type0 dict. ISO 19005-2 §6.2.11 requires /ToUnicode on the
// PARENT font dict — descendants don't carry their own and MUST be
// skipped to avoid false-positive violations.
const DESCENDANT_FONT_SUBTYPES: ReadonlySet<string> = new Set(['CIDFontType0', 'CIDFontType2']);

function validateEmbeddedFontsHaveToUnicode(pdf: PDFDocument, violations: string[]): void {
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    if (object.lookupMaybe(FONT_TYPE_KEY, PDFName)?.decodeText() !== 'Font') continue;

    const subtype = object.lookupMaybe(SUBTYPE_KEY, PDFName)?.decodeText();

    if (subtype === undefined) continue;
    if (DESCENDANT_FONT_SUBTYPES.has(subtype)) continue;

    const baseFont = object.lookupMaybe(BASE_FONT_KEY, PDFName)?.decodeText();
    const hasFontDescriptor = object.lookupMaybe(FONT_DESCRIPTOR_KEY, PDFDict) !== undefined;
    const isStandardUnembedded =
      baseFont !== undefined && STANDARD_FONT_BASES.has(stripFontPrefix(baseFont)) && !hasFontDescriptor;

    if (isStandardUnembedded) continue;

    if (object.get(TO_UNICODE_KEY) === undefined) {
      violations.push(
        `Font ${baseFont ?? '<unnamed>'} is embedded without a /ToUnicode CMap — required by ISO 19005-2 §6.2.11`,
      );
    }
  }
}

/**
 * ISO 19005-2 §6.2.4 — pages that use transparency MUST declare a
 * blending colour space via `/Group /S /Transparency /CS <name>` on
 * either the page object or the form-XObject. The in-tree exporter
 * does not currently emit transparency, so this check fires only if
 * an external editor injected a transparent operator without the
 * accompanying group dictionary.
 */
function validateNoTransparencyWithoutGroup(grepText: string, violations: string[]): void {
  // PDF graphics-state alpha: as `<value> ca` / `<value> CA` operators
  // in the content stream, or as `/CA <value>` / `/ca <value>` entries
  // in /ExtGState dicts. /SMask appears either form.
  const usesTransparency =
    /\/(?:CA|ca)\s+0?\.\d/.test(grepText) || /\b0?\.\d+\s+(?:ca|CA)\b/.test(grepText) || /\/SMask\b/.test(grepText);

  if (!usesTransparency) return;

  if (!/\/Group\s*<<[^>]*\/S\s+\/Transparency/.test(grepText)) {
    violations.push(
      'PDF uses transparency operators (CA/ca/SMask) but no /Group /S /Transparency declared — required under PDF/A-2',
    );
  }
}

function stripFontPrefix(name: string): string {
  // PDF font names are sometimes prefixed with a six-character subset
  // tag (`AAAAAA+Helvetica`); strip it before standard-14 lookup.
  const plus = name.indexOf('+');

  return plus === -1 ? name : name.slice(plus + 1);
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

  if (xmp.pdfa.conformance !== 'B' && xmp.pdfa.conformance !== 'U' && xmp.pdfa.conformance !== 'A') {
    violations.push(`pdfaid:conformance is "${xmp.pdfa.conformance}", expected "B", "U", or "A"`);
  }

  return { valid: violations.length === 0, violations };
}

async function serialiseForGrep(pdf: PDFDocument): Promise<string> {
  const bytes = await pdf.save({ useObjectStreams: false });
  const trailerText = new TextDecoder('latin1').decode(bytes);
  const decompressedContent = decompressedPageContents(pdf);

  // Concat the structural surface (catalog, dicts, trailer) with the
  // decompressed page-content operators so the grep-based checks can
  // see both kinds of violations (dict-level + operator-level).
  return `${trailerText}\n${decompressedContent}`;
}

function decompressedPageContents(pdf: PDFDocument): string {
  const chunks: string[] = [];

  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();

    if (contents === undefined) continue;

    const entries =
      contents instanceof PDFArray ? Array.from({ length: contents.size() }, (_, i) => contents.get(i)) : [contents];

    for (const entry of entries) {
      const stream = resolveContentStream(pdf, entry);

      if (stream === undefined) continue;

      const decoded = tryDecodeRawStream(stream);

      if (decoded !== undefined) chunks.push(new TextDecoder('latin1').decode(decoded));
    }
  }

  return chunks.join('\n');
}

function resolveContentStream(pdf: PDFDocument, entry: unknown): PDFStream | undefined {
  if (entry instanceof PDFRef) {
    const resolved = pdf.context.lookup(entry);

    return resolved instanceof PDFStream ? resolved : undefined;
  }

  if (entry instanceof PDFStream) return entry;

  return undefined;
}

function tryDecodeRawStream(stream: PDFStream): Uint8Array | undefined {
  if (!(stream instanceof PDFRawStream)) return undefined;

  try {
    return decodePDFRawStream(stream).decode();
  } catch {
    return undefined;
  }
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

  if (xmp.pdfa.conformance !== 'B' && xmp.pdfa.conformance !== 'U' && xmp.pdfa.conformance !== 'A') {
    violations.push(`pdfaid:conformance is "${xmp.pdfa.conformance}", expected "B", "U", or "A"`);
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
