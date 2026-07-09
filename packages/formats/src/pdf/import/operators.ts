import {
  decodePDFRawStream,
  PDFArray,
  type PDFDocument,
  PDFName,
  type PDFPage,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from 'pdf-lib';

/**
 * A single text-showing instance extracted from a page's content stream.
 * Positions are in PDF points (origin bottom-left). `fontSize` is the
 * `Tf` operand from the most recent `Tf` in the BT / ET block.
 *
 * This is an intentionally shallow model — the P6.4b pass lands a
 * best-effort text extraction, not a full PDF interpreter. Rich-text
 * runs, kerning, complex scripts, and font metric-aware sizing ride
 * with a dedicated operator engine in a later iteration.
 */
export interface ExtractedTextItem {
  readonly text: string;
  readonly xPt: number;
  readonly yPt: number;
  readonly fontSizePt: number;
}

/**
 * Default cumulative cap on decoded operator-stream bytes. Sums across
 * every page; once the running total crosses the cap the importer
 * stops decoding additional pages and surfaces a structured warning.
 * 16 MiB covers every realistic design-tool export while bounding the
 * Latin-1 scan budget on a hostile PDF that fans out into many
 * compressed-but-huge content streams. Closes the 2026-04-28 audit
 * follow-up "PDF content streams are still decoded and concatenated
 * without an operator byte budget".
 */
const DEFAULT_MAX_OPERATOR_BYTES = 16 * 1024 * 1024;

interface OperatorExtractionResult {
  readonly items: readonly ExtractedTextItem[];
  readonly warnings: readonly string[];
  /**
   * `true` when the importer stopped extracting because the cumulative
   * decoded operator-stream bytes crossed the configured cap. Callers
   * surface a warning so users know the result is partial.
   */
  readonly capExceeded: boolean;
  /** The cap that was active for the run (default or caller-supplied). */
  readonly capBytes: number;
}

/**
 * Cap-aware operator-stream scan. Iterates pages while accumulating
 * decoded byte count; stops as soon as the next decoded content stream
 * would cross `capBytes`. Returns the accumulated items plus a flag
 * for callers that need to emit a warning. The cap is enforced at
 * content-stream granularity, so recoverable earlier streams on the
 * same page are kept instead of being discarded with a later huge
 * stream.
 */
export function extractTextItemsWithBudget(
  pdf: PDFDocument,
  capBytes: number = DEFAULT_MAX_OPERATOR_BYTES,
): OperatorExtractionResult {
  const items: ExtractedTextItem[] = [];
  const pages = safeGetPages(pdf);
  const warnings: string[] = [];
  let bytesScanned = 0;
  let capExceeded = false;

  pageLoop: for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];

    if (page === undefined) continue;

    const streamResult = readPageContentChunks(pdf, page, pageIndex);

    warnings.push(...streamResult.warnings);

    for (const streamBytes of streamResult.chunks) {
      if (capBytes > 0 && bytesScanned + streamBytes.byteLength > capBytes) {
        capExceeded = true;
        break pageLoop;
      }

      bytesScanned += streamBytes.byteLength;

      const text = bytesToLatin1(streamBytes);

      items.push(...scanContentStreamForText(text));
    }
  }

  return { items, warnings, capExceeded, capBytes };
}

/**
 * Walk the document's pages safely. pdf-lib's `getPages` throws when
 * the catalog's `/Pages` tree is missing or malformed (which happens
 * with truncated / fuzzed inputs). Wrap so the caller treats the
 * "no pages" case as an empty extraction rather than crashing.
 */
function safeGetPages(pdf: PDFDocument): readonly PDFPage[] {
  try {
    return pdf.getPages();
  } catch {
    return [];
  }
}

interface ContentReadResult {
  readonly bytes: Uint8Array | undefined;
  readonly warnings: readonly string[];
}

interface PageContentChunksResult {
  readonly chunks: readonly Uint8Array[];
  readonly warnings: readonly string[];
}

function readPageContentChunks(pdf: PDFDocument, page: PDFPage, pageIndex: number): PageContentChunksResult {
  const contents = page.node.Contents();

  if (contents === undefined) return { chunks: [], warnings: [] };

  if (contents instanceof PDFArray) {
    // Multiple content streams — PDF spec allows the value to be either
    // a single stream or an array of streams. The entries can also be
    // indirect references (`PDFRef`) that need resolving through the
    // document context.
    const chunks: Uint8Array[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < contents.size(); i++) {
      const resolved = resolveContentEntry(pdf, contents.get(i), pageIndex, i);

      warnings.push(...resolved.warnings);

      if (resolved.bytes !== undefined) chunks.push(resolved.bytes);
    }

    return { chunks, warnings };
  }

  if (contents instanceof PDFRef) {
    const resolved = resolveContentEntry(pdf, contents, pageIndex, 0);

    return {
      chunks: resolved.bytes === undefined ? [] : [resolved.bytes],
      warnings: resolved.warnings,
    };
  }

  if (contents instanceof PDFStream) {
    const resolved = tryDecodeStream(contents, pageIndex);

    return {
      chunks: resolved.bytes === undefined ? [] : [resolved.bytes],
      warnings: resolved.warnings,
    };
  }

  return {
    chunks: [],
    warnings: [
      `PDF import: page ${String(pageIndex + 1)} content entry is not a stream; text extraction skipped for that entry.`,
    ],
  };
}

function resolveContentEntry(
  pdf: PDFDocument,
  entry: unknown,
  pageIndex: number,
  streamIndex: number,
): ContentReadResult {
  if (entry instanceof PDFRef) {
    const resolved = pdf.context.lookup(entry);

    if (resolved instanceof PDFStream) {
      return tryDecodeStream(resolved, pageIndex, streamIndex);
    }

    return {
      bytes: undefined,
      warnings: [
        `PDF import: page ${String(pageIndex + 1)} content stream ${String(streamIndex + 1)} reference did not resolve to a stream; text extraction skipped for that entry.`,
      ],
    };
  }

  if (entry instanceof PDFStream) {
    return tryDecodeStream(entry, pageIndex, streamIndex);
  }

  return {
    bytes: undefined,
    warnings: [
      `PDF import: page ${String(pageIndex + 1)} content entry ${String(streamIndex + 1)} is not a stream; text extraction skipped for that entry.`,
    ],
  };
}

function tryDecodeStream(stream: PDFStream, pageIndex: number, streamIndex?: number): ContentReadResult {
  if (stream instanceof PDFRawStream) {
    try {
      // `decodePDFRawStream` returns a `StreamType` (pdf-lib's internal
      // decode-stream abstraction). Call `.decode()` to pull the
      // decompressed bytes into a Uint8Array.
      return { bytes: decodePDFRawStream(stream).decode(), warnings: [] };
    } catch (error: unknown) {
      return {
        bytes: undefined,
        warnings: [buildDecodeWarning(stream, pageIndex, streamIndex, error)],
      };
    }
  }

  return {
    bytes: undefined,
    warnings: [buildDecodeWarning(stream, pageIndex, streamIndex)],
  };
}

function buildDecodeWarning(stream: PDFStream, pageIndex: number, streamIndex?: number, error?: unknown): string {
  const streamLabel = streamIndex === undefined ? 'content stream' : `content stream ${String(streamIndex + 1)}`;
  const filters = describeStreamFilters(stream);
  const filterText = filters.length > 0 ? ` using filter(s) ${filters.join(', ')}` : '';
  const detail = error instanceof Error && error.message.length > 0 ? ` (${error.message})` : '';

  return `PDF import: page ${String(pageIndex + 1)} ${streamLabel}${filterText} could not be decoded; text extraction skipped for that stream${detail}.`;
}

function describeStreamFilters(stream: PDFStream): readonly string[] {
  try {
    const filterValue = stream.dict.get(PDFName.of('Filter'));

    if (filterValue instanceof PDFName) return [filterValue.decodeText()];

    if (filterValue instanceof PDFArray) {
      const filters: string[] = [];

      for (let i = 0; i < filterValue.size(); i++) {
        const item = filterValue.get(i);

        if (item instanceof PDFName) filters.push(item.decodeText());
      }

      return filters;
    }
  } catch {
    return [];
  }

  return [];
}

function bytesToLatin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

/* ------------------------------------------------------------------ */
/*  Content-stream scanner                                             */
/* ------------------------------------------------------------------ */

const FLOAT = '-?\\d+(?:\\.\\d+)?';
const BT_RE = /\bBT\b/g;
const ET_RE = /\bET\b/g;

// `x y Td` or `x y TD` — text line-start offset, applied as a delta to
// the current text cursor.
const TD_RE = new RegExp(`(${FLOAT})\\s+(${FLOAT})\\s+T[dD]`, 'g');
// `a b c d e f Tm` — text matrix. We only care about `e, f` (the
// translation components) for positioning.
const TM_RE = new RegExp(`(${FLOAT})\\s+(${FLOAT})\\s+(${FLOAT})\\s+(${FLOAT})\\s+(${FLOAT})\\s+(${FLOAT})\\s+Tm`, 'g');
// `/Font size Tf`
const TF_RE = new RegExp(`/\\w+\\s+(${FLOAT})\\s+Tf`, 'g');
// `(text) Tj` — parenthesised literal string, backslash-escaped. We
// require non-empty content to avoid matching `() Tj`.
const TJ_LITERAL_RE = /\(((?:\\.|[^\\()])*)\)\s+Tj/g;

// `<HEXCODES> Tj` — hex-encoded string (pdf-lib emits this form by default
// for WinAnsi-encoded text runs). Hex pairs are decoded to bytes and then
// Latin-1 → text.
const TJ_HEX_RE = /<([0-9A-Fa-f\s]*)>\s+Tj/g;

// `[...] TJ` — array form with inline kerning numbers.
// Array contains strings (either `(…)` literal or `<…>` hex) interleaved
// with numeric kerning offsets we discard. We match the whole array
// lazily and reparse its contents via `TJ_ARRAY_ITEM_RE`.
const TJ_ARRAY_RE = /\[([^\]]*)\]\s+TJ/g;
const TJ_ARRAY_ITEM_RE = /\(((?:\\.|[^\\()])*)\)|<([0-9A-Fa-f\s]*)>/g;

function scanContentStreamForText(content: string): readonly ExtractedTextItem[] {
  const items: ExtractedTextItem[] = [];

  for (const block of collectTextBlocks(content)) {
    items.push(...extractItemsFromBlock(block));
  }

  return items;
}

function collectTextBlocks(content: string): readonly string[] {
  const blocks: string[] = [];

  BT_RE.lastIndex = 0;

  let startMatch: RegExpExecArray | null;

  while ((startMatch = BT_RE.exec(content)) !== null) {
    const startIndex = startMatch.index + startMatch[0].length;

    ET_RE.lastIndex = startIndex;

    const endMatch = ET_RE.exec(content);

    if (endMatch === null) break;

    blocks.push(content.slice(startIndex, endMatch.index));

    BT_RE.lastIndex = endMatch.index + endMatch[0].length;
  }

  return blocks;
}

interface RegexMatch {
  readonly index: number;
  readonly captures: readonly (string | undefined)[];
}

function capture(match: RegexMatch, index: number): string | undefined {
  return match.captures[index];
}

function execAll(regex: RegExp, text: string): readonly RegexMatch[] {
  const matches: RegexMatch[] = [];

  regex.lastIndex = 0;

  let rawMatch: RegExpExecArray | null;

  while ((rawMatch = regex.exec(text)) !== null) {
    const captures: (string | undefined)[] = [];

    for (let index = 0; index < rawMatch.length; index += 1) {
      captures.push(rawMatch[index]);
    }

    matches.push({ index: rawMatch.index, captures });

    if (rawMatch[0] === '') regex.lastIndex += 1;
  }

  return matches;
}

function extractItemsFromBlock(block: string): readonly ExtractedTextItem[] {
  const items: ExtractedTextItem[] = [];

  let cursorX = 0;
  let cursorY = 0;
  let fontSize = 12;

  const events = collectEvents(block);

  for (const event of events) {
    switch (event.kind) {
      case 'tm':
        cursorX = event.x;
        cursorY = event.y;
        break;
      case 'td':
        cursorX += event.x;
        cursorY += event.y;
        break;
      case 'tf':
        fontSize = event.size;
        break;
      case 'tj':
        items.push({
          text: event.text,
          xPt: cursorX,
          yPt: cursorY,
          fontSizePt: fontSize,
        });
        break;
    }
  }

  return items;
}

type ContentEvent =
  | { readonly kind: 'tm'; readonly index: number; readonly x: number; readonly y: number }
  | { readonly kind: 'td'; readonly index: number; readonly x: number; readonly y: number }
  | { readonly kind: 'tf'; readonly index: number; readonly size: number }
  | { readonly kind: 'tj'; readonly index: number; readonly text: string };

function collectEvents(block: string): readonly ContentEvent[] {
  const events: ContentEvent[] = [
    ...collectTmEvents(block),
    ...collectTdEvents(block),
    ...collectTfEvents(block),
    ...collectTjLiteralEvents(block),
    ...collectTjHexEvents(block),
    ...collectTjArrayEvents(block),
  ];

  events.sort((a, b) => a.index - b.index);

  return events;
}

function collectTmEvents(block: string): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TM_RE, block)) {
    const e = parseFloatSafe(capture(match, 5));
    const f = parseFloatSafe(capture(match, 6));

    if (e === null || f === null) continue;

    events.push({ kind: 'tm', index: match.index, x: e, y: f });
  }

  return events;
}

function collectTdEvents(block: string): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TD_RE, block)) {
    const x = parseFloatSafe(capture(match, 1));
    const y = parseFloatSafe(capture(match, 2));

    if (x === null || y === null) continue;

    events.push({ kind: 'td', index: match.index, x, y });
  }

  return events;
}

function collectTfEvents(block: string): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TF_RE, block)) {
    const size = parseFloatSafe(capture(match, 1));

    if (size === null) continue;

    events.push({ kind: 'tf', index: match.index, size });
  }

  return events;
}

function collectTjLiteralEvents(block: string): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TJ_LITERAL_RE, block)) {
    const literal = capture(match, 1) ?? '';

    events.push({ kind: 'tj', index: match.index, text: decodePdfStringLiteral(literal) });
  }

  return events;
}

function collectTjHexEvents(block: string): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TJ_HEX_RE, block)) {
    const hex = capture(match, 1) ?? '';
    const decoded = decodePdfHexLiteral(hex);

    if (decoded.length === 0) continue;

    events.push({ kind: 'tj', index: match.index, text: decoded });
  }

  return events;
}

/**
 * `[(chunk1) -100 (chunk2) <hex3>] TJ` — array form with inline
 * kerning numbers. We concatenate every string chunk (literal + hex),
 * ignoring the kerning deltas. The result is a single event per TJ
 * array at the array's position in the block.
 */
function collectTjArrayEvents(block: string): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TJ_ARRAY_RE, block)) {
    const text = decodeTjArrayBody(capture(match, 1) ?? '');

    if (text.length === 0) continue;

    events.push({ kind: 'tj', index: match.index, text });
  }

  return events;
}

function decodeTjArrayBody(body: string): string {
  const chunks: string[] = [];

  for (const item of execAll(TJ_ARRAY_ITEM_RE, body)) {
    const literal = capture(item, 1);

    if (literal !== undefined) {
      chunks.push(decodePdfStringLiteral(literal));
      continue;
    }

    const hex = capture(item, 2);

    if (hex !== undefined) {
      const decoded = decodePdfHexLiteral(hex);

      if (decoded.length > 0) chunks.push(decoded);
    }
  }

  return chunks.join('');
}

function parseFloatSafe(raw: string | undefined): number | null {
  if (raw === undefined) return null;

  const parsed = Number.parseFloat(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

/** PDF single-char escape sequences (§ 7.3.4.2). */
const SINGLE_CHAR_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
  ['b', '\b'],
  ['f', '\f'],
  ['(', '('],
  [')', ')'],
  ['\\', '\\'],
]);

interface EscapeDecode {
  readonly produced: string;
  readonly consumed: number;
}

/**
 * Decode a PDF parenthesised string literal: unescape `\\n`, `\\r`, `\\t`,
 * `\\(`, `\\)`, `\\\\`, and 3-digit octal escapes. Callers discard
 * malformed escapes gracefully.
 */
function decodePdfStringLiteral(raw: string): string {
  const parts: string[] = [];

  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (ch === undefined) break;

    if (ch !== '\\') {
      parts.push(ch);
      i += 1;
      continue;
    }

    const next = raw[i + 1];

    if (next === undefined) break;

    const decoded = decodeOneEscape(raw, i + 1, next);

    parts.push(decoded.produced);
    i = i + 1 + decoded.consumed;
  }

  return parts.join('');
}

function decodeOneEscape(raw: string, startIndex: number, next: string): EscapeDecode {
  const single = SINGLE_CHAR_ESCAPES.get(next);

  if (single !== undefined) {
    return { produced: single, consumed: 1 };
  }

  if (next >= '0' && next <= '7') {
    return decodeOctalEscape(raw, startIndex);
  }

  // Unknown escape — PDF spec says drop the backslash, keep the next char.
  return { produced: next, consumed: 1 };
}

function decodeOctalEscape(raw: string, startIndex: number): EscapeDecode {
  let octal = '';
  let offset = 0;

  while (offset < 3 && startIndex + offset < raw.length) {
    const digit = raw[startIndex + offset];

    if (digit === undefined || digit < '0' || digit > '7') break;

    octal += digit;
    offset += 1;
  }

  if (octal.length === 0) {
    return { produced: '', consumed: 0 };
  }

  return {
    produced: String.fromCharCode(Number.parseInt(octal, 8)),
    consumed: offset,
  };
}

/**
 * Decode a PDF hex-encoded string literal (`<48656C6C6F>` → `"Hello"`).
 * Whitespace inside the hex block is ignored; an odd trailing hex digit
 * is padded with `0` per PDF 1.7 § 7.3.4.3. Returns an empty string for
 * malformed input.
 */
function decodePdfHexLiteral(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '');

  if (cleaned.length === 0) return '';

  const padded = cleaned.length % 2 === 0 ? cleaned : `${cleaned}0`;

  let out = '';

  for (let i = 0; i < padded.length; i += 2) {
    const byte = Number.parseInt(padded.slice(i, i + 2), 16);

    if (!Number.isFinite(byte)) return '';

    out += String.fromCharCode(byte);
  }

  return out;
}
