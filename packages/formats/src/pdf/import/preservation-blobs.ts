import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFName,
  type PDFPage,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
} from 'pdf-lib';

const RESOURCES_KEY = PDFName.of('Resources');
const PROPERTIES_KEY = PDFName.of('Properties');
const ID_KEY = PDFName.of('ID');
const BS_PROPERTY_PREFIX = 'BS_';

/**
 * Marker delimiters for `/BSET <name> BDC ... EMC` blocks emitted by
 * the Broadset exporter. The marker `/BSET` distinguishes Broadset
 * marked-content from third-party tags so the scanner only captures
 * operator slices we are responsible for.
 */
const BSET_MARKER = '/BSET';
const BDC_OPERATOR = 'BDC';
const EMC_OPERATOR = 'EMC';

/**
 * Operator-level preservation blobs captured from a PDF's content
 * streams during import. Each entry maps a Broadset element id to the
 * exact byte slice of operators between its `/BSET <propName> BDC`
 * marker and the matching `EMC` operator, base64-encoded for
 * transport via `extensions.pdf.preservationBlob`.
 *
 * The exporter writes the blob back to the marked-content `/Blob`
 * property so an untouched (`dirty === false`) round-trip preserves
 * the source operators byte-stably even when the synthesiser would
 * have produced visually-equivalent but byte-different output (e.g.
 * a different `cm` matrix factorisation, different number formatting,
 * or a different graphics-state push order).
 */
type PreservationBlobMap = ReadonlyMap<string, string>;

/**
 * Walk every page of `pdf`, decode the page content stream, find each
 * `/BSET /BS_<name> BDC ... EMC` block, and capture the operator
 * slice as a base64-encoded preservation blob keyed by the
 * element id resolved from the page's `/Resources /Properties /BS_<name>`
 * marked-content property dict.
 *
 * Nested marked-content sequences (a `/BSET ... BDC` inside another
 * `/BSET ... BDC ... EMC`) are tracked by depth so the captured slice
 * for the outer element includes its nested children verbatim.
 */
export function capturePreservationBlobs(pdf: PDFDocument): PreservationBlobMap {
  const blobs = new Map<string, string>();
  const pages = safeGetPages(pdf);

  for (const page of pages) {
    capturePageBlobs(pdf, page, blobs);
  }

  return blobs;
}

/**
 * Safe variant of pdf-lib's `getPages` — wraps the throw on a
 * malformed `/Pages` tree into an empty array so the capture pass
 * never crashes the importer.
 */
function safeGetPages(pdf: PDFDocument): readonly PDFPage[] {
  try {
    return pdf.getPages();
  } catch {
    return [];
  }
}

function capturePageBlobs(pdf: PDFDocument, page: PDFPage, blobs: Map<string, string>): void {
  const propertyToElementId = readPropertyNameToIdMap(page);

  if (propertyToElementId.size === 0) return;

  const streamBytes = readPageContentBytes(pdf, page);

  if (streamBytes === undefined) return;

  const text = bytesToLatin1(streamBytes);

  for (const slice of collectBsetSlices(text)) {
    const elementId = propertyToElementId.get(slice.propertyName);

    if (elementId === undefined) continue;

    // Trim PDF inter-operator whitespace at the slice boundaries so
    // the captured blob contains only the operator bytes themselves.
    // The BDC operator emits trailing whitespace and the EMC operator
    // is preceded by whitespace; including those in the blob would
    // make subsequent re-emission round-trips diverge byte-for-byte.
    const trimmedStart = skipPdfWhitespaceForward(streamBytes, slice.start, slice.end);
    const trimmedEnd = skipPdfWhitespaceBackward(streamBytes, trimmedStart, slice.end);
    const sliceBytes = streamBytes.subarray(trimmedStart, trimmedEnd);

    blobs.set(elementId, bytesToBase64(sliceBytes));
  }
}

const PDF_WHITESPACE_BYTES: ReadonlySet<number> = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);

function skipPdfWhitespaceForward(bytes: Uint8Array, start: number, end: number): number {
  let i = start;

  while (i < end && PDF_WHITESPACE_BYTES.has(bytes[i] ?? 0)) i += 1;

  return i;
}

function skipPdfWhitespaceBackward(bytes: Uint8Array, start: number, end: number): number {
  let i = end;

  while (i > start && PDF_WHITESPACE_BYTES.has(bytes[i - 1] ?? 0)) i -= 1;

  return i;
}

/**
 * Build a map from `/BS_<...>` property name → Broadset element id by
 * scanning the page's `/Resources /Properties` dict. Property names
 * without a `/BS_` prefix are ignored so third-party marked-content
 * never enters the blob map.
 */
function readPropertyNameToIdMap(page: PDFPage): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const resources = page.node.lookupMaybe(RESOURCES_KEY, PDFDict);

  if (resources === undefined) return map;

  const properties = resources.lookupMaybe(PROPERTIES_KEY, PDFDict);

  if (properties === undefined) return map;

  for (const [keyName] of properties.entries()) {
    const propertyName = keyName.decodeText();

    if (!propertyName.startsWith(BS_PROPERTY_PREFIX)) continue;

    const dict = properties.lookupMaybe(keyName, PDFDict);

    if (dict === undefined) continue;

    const idEntry = dict.lookupMaybe(ID_KEY, PDFString);

    if (idEntry === undefined) continue;

    map.set(propertyName, idEntry.decodeText());
  }

  return map;
}

/**
 * Decoded slice descriptor for a single `/BSET <propName> BDC ... EMC`
 * block.
 *
 * - `propertyName` is the resource dictionary name without the leading slash
 *   (e.g. `BS_rect-1`).
 * - `start` / `end` are byte offsets into the decoded content stream marking
 *   the operator slice that should be re-emitted byte-stably (after the
 *   BDC operator and before the matching EMC).
 */
interface BsetSlice {
  readonly propertyName: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Iterate every `/BSET <propName> BDC ... EMC` block in `content`,
 * yielding the byte offsets of the operator slice between BDC and EMC.
 * Nested marked-content sequences are accounted for by depth tracking
 * so the slice for the outer block contains its inner blocks verbatim.
 */
function collectBsetSlices(content: string): readonly BsetSlice[] {
  const slices: BsetSlice[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const markerIndex = content.indexOf(BSET_MARKER, cursor);

    if (markerIndex === -1) return slices;

    const after = parseBsetHeader(content, markerIndex);

    if (after === null) {
      cursor = markerIndex + BSET_MARKER.length;
      continue;
    }

    const slice = findMatchingEmc(content, after.bdcEnd);

    if (slice === null) {
      cursor = after.bdcEnd;
      continue;
    }

    slices.push({
      propertyName: after.propertyName,
      start: after.bdcEnd,
      end: slice.emcStart,
    });

    cursor = slice.emcEnd;
  }

  return slices;
}

interface BsetHeader {
  readonly propertyName: string;
  readonly bdcEnd: number;
}

/**
 * Parse the header slice `/BSET <whitespace> /<propName> <whitespace> BDC`
 * starting at `markerIndex`. Returns `null` when the marker is not a
 * valid `/BSET` BDC opener (e.g. `/BSET` appearing inside a string
 * literal — extremely unlikely but handled gracefully).
 */
function parseBsetHeader(content: string, markerIndex: number): BsetHeader | null {
  let cursor = markerIndex + BSET_MARKER.length;

  cursor = skipWhitespace(content, cursor);

  if (content[cursor] !== '/') return null;

  cursor += 1;

  const propStart = cursor;

  while (cursor < content.length && isPdfNameChar(content[cursor])) cursor += 1;

  if (cursor === propStart) return null;

  const propertyName = content.slice(propStart, cursor);

  cursor = skipWhitespace(content, cursor);

  if (content.slice(cursor, cursor + BDC_OPERATOR.length) !== BDC_OPERATOR) return null;

  return {
    propertyName,
    bdcEnd: cursor + BDC_OPERATOR.length,
  };
}

interface EmcMatch {
  readonly emcStart: number;
  readonly emcEnd: number;
}

/**
 * Walk forward from `start` and find the matching EMC for a previously
 * opened BDC, accounting for nested BDC / BMC openers. Returns `null`
 * when the content stream truncates mid-block (a malformed PDF the
 * exporter must skip rather than crash on).
 */
function findMatchingEmc(content: string, start: number): EmcMatch | null {
  let depth = 1;
  let cursor = start;

  while (cursor < content.length) {
    const next = nextOperatorOfInterest(content, cursor);

    if (next === null) return null;

    if (next.kind === 'open') {
      depth += 1;
      cursor = next.end;
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      return { emcStart: next.start, emcEnd: next.end };
    }

    cursor = next.end;
  }

  return null;
}

type OperatorOfInterest = { readonly kind: 'open' | 'close'; readonly start: number; readonly end: number };

const BMC_OPERATOR = 'BMC';

/**
 * Find the next BDC / BMC (open) or EMC (close) operator at a token
 * boundary in `content` starting from `cursor`, ignoring matches that
 * appear inside literal strings, hex strings, names, or comments.
 */
function nextOperatorOfInterest(content: string, cursor: number): OperatorOfInterest | null {
  let i = cursor;

  while (i < content.length) {
    const ch = content[i];

    if (ch === undefined) return null;

    const skipped = skipNonOperator(content, i, ch);

    if (skipped !== null) {
      i = skipped;
      continue;
    }

    const operatorMatch = matchOperatorAt(content, i);

    if (operatorMatch !== null) return operatorMatch;

    if (isWordStartAt(content, i)) {
      i += readWord(content, i).length;
      continue;
    }

    i += 1;
  }

  return null;
}

/**
 * Advance past structures that can contain operator-shaped substrings
 * but are not real operators: comments, literal strings, hex strings,
 * and dictionary literals. Returns the post-skip cursor, or `null`
 * when the character at `index` doesn't open any of those structures.
 */
function skipNonOperator(content: string, index: number, ch: string): number | null {
  if (ch === '%') return skipComment(content, index);
  if (ch === '(') return skipLiteralString(content, index);

  if (ch === '<') {
    return content[index + 1] === '<' ? skipDictionary(content, index) : skipHexString(content, index);
  }

  return null;
}

function matchOperatorAt(content: string, index: number): OperatorOfInterest | null {
  if (!isWordStartAt(content, index)) return null;

  const word = readWord(content, index);

  if (word === BDC_OPERATOR || word === BMC_OPERATOR) {
    return { kind: 'open', start: index, end: index + word.length };
  }

  if (word === EMC_OPERATOR) {
    return { kind: 'close', start: index, end: index + word.length };
  }

  return null;
}

function skipComment(content: string, start: number): number {
  let i = start;

  while (i < content.length && content[i] !== '\n' && content[i] !== '\r') i += 1;

  return i;
}

function skipLiteralString(content: string, start: number): number {
  let i = start + 1;
  let depth = 1;

  while (i < content.length && depth > 0) {
    const ch = content[i];

    if (ch === '\\') {
      i += 2;
      continue;
    }

    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;

    i += 1;
  }

  return i;
}

function skipHexString(content: string, start: number): number {
  let i = start + 1;

  while (i < content.length && content[i] !== '>') i += 1;

  return i + 1;
}

function skipDictionary(content: string, start: number): number {
  let i = start + 2;
  let depth = 1;

  while (i < content.length && depth > 0) {
    const ch = content[i];

    if (ch === '<' && content[i + 1] === '<') {
      depth += 1;
      i += 2;
      continue;
    }

    if (ch === '>' && content[i + 1] === '>') {
      depth -= 1;
      i += 2;
      continue;
    }

    i += 1;
  }

  return i;
}

function isWordStartAt(content: string, index: number): boolean {
  if (index === 0) return isWordChar(content[index]);

  const prev = content[index - 1];

  return !isWordChar(prev) && isWordChar(content[index]);
}

function readWord(content: string, start: number): string {
  let end = start;

  while (end < content.length && isWordChar(content[end])) end += 1;

  return content.slice(start, end);
}

function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;

  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '_';
}

function isPdfNameChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  if (ch === '/' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') return false;
  if (ch === '<' || ch === '>' || ch === '[' || ch === ']' || ch === '(' || ch === ')') return false;
  if (ch === '{' || ch === '}' || ch === '%') return false;

  return true;
}

function skipWhitespace(content: string, start: number): number {
  let i = start;

  while (i < content.length) {
    const ch = content[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') {
      i += 1;
      continue;
    }

    break;
  }

  return i;
}

function readPageContentBytes(pdf: PDFDocument, page: PDFPage): Uint8Array | undefined {
  const contents = page.node.Contents();

  if (contents === undefined) return undefined;

  if (contents instanceof PDFArray) {
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < contents.size(); i++) {
      const resolved = resolveContentEntry(pdf, contents.get(i));

      if (resolved !== undefined) chunks.push(resolved);
    }

    return concatBytes(chunks);
  }

  if (contents instanceof PDFStream) {
    return tryDecodeStream(contents);
  }

  return undefined;
}

function resolveContentEntry(pdf: PDFDocument, entry: unknown): Uint8Array | undefined {
  if (entry instanceof PDFRef) {
    const resolved = pdf.context.lookup(entry);

    if (resolved instanceof PDFStream) return tryDecodeStream(resolved);

    return undefined;
  }

  if (entry instanceof PDFStream) return tryDecodeStream(entry);

  return undefined;
}

function tryDecodeStream(stream: PDFStream): Uint8Array | undefined {
  if (!(stream instanceof PDFRawStream)) return undefined;

  try {
    return decodePDFRawStream(stream).decode();
  } catch {
    return undefined;
  }
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

function bytesToLatin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }

  // `globalThis.btoa` is available on every JS runtime Broadset
  // targets (browsers, Node 16+, Bun). Using it avoids a Buffer
  // dependency in code that runs in both Node and the browser.
  return globalThis.btoa(binary);
}
