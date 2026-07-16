import { PDFArray, type PDFDocument, PDFName, type PDFPage, PDFRawStream, PDFRef, PDFStream } from 'pdf-lib';

import { decodePdfRawStreamBoundedV1 } from './bounded-stream';

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
interface ExtractedTextItem {
  readonly text: string;
  readonly xPt: number;
  readonly yPt: number;
  readonly fontSizePt: number;
  readonly fontName: string;
}

interface ContentReadResult {
  readonly bytes: Uint8Array | undefined;
  readonly warnings: readonly string[];
}

interface PageContentChunksResult {
  readonly chunks: readonly Uint8Array[];
  readonly warnings: readonly string[];
}

export function readPageContentChunks(input: {
  readonly pdf: PDFDocument;
  readonly page: PDFPage;
  readonly pageIndex: number;
  readonly maxTotalBytes: number;
}): PageContentChunksResult {
  const contents = input.page.node.Contents();

  if (contents === undefined) return { chunks: [], warnings: [] };

  if (contents instanceof PDFArray) {
    // Multiple content streams — PDF spec allows the value to be either
    // a single stream or an array of streams. The entries can also be
    // indirect references (`PDFRef`) that need resolving through the
    // document context.
    const chunks: Uint8Array[] = [];
    const warnings: string[] = [];
    let remainingBytes = input.maxTotalBytes;

    for (let i = 0; i < contents.size(); i++) {
      const resolved = resolveContentEntry({
        pdf: input.pdf,
        entry: contents.get(i),
        pageIndex: input.pageIndex,
        streamIndex: i,
        maxBytes: remainingBytes,
      });

      warnings.push(...resolved.warnings);

      if (resolved.bytes !== undefined) {
        chunks.push(resolved.bytes);
        remainingBytes -= resolved.bytes.byteLength;
      }
    }

    return { chunks, warnings };
  }

  if (contents instanceof PDFRef) {
    const resolved = resolveContentEntry({
      pdf: input.pdf,
      entry: contents,
      pageIndex: input.pageIndex,
      streamIndex: 0,
      maxBytes: input.maxTotalBytes,
    });

    return {
      chunks: resolved.bytes === undefined ? [] : [resolved.bytes],
      warnings: resolved.warnings,
    };
  }

  if (contents instanceof PDFStream) {
    const resolved = tryDecodeStream({
      stream: contents,
      pageIndex: input.pageIndex,
      maxBytes: input.maxTotalBytes,
    });

    return {
      chunks: resolved.bytes === undefined ? [] : [resolved.bytes],
      warnings: resolved.warnings,
    };
  }

  return {
    chunks: [],
    warnings: [
      `PDF import: page ${String(input.pageIndex + 1)} content entry is not a stream; text extraction skipped for that entry.`,
    ],
  };
}

function resolveContentEntry(input: {
  readonly pdf: PDFDocument;
  readonly entry: unknown;
  readonly pageIndex: number;
  readonly streamIndex: number;
  readonly maxBytes: number;
}): ContentReadResult {
  if (input.entry instanceof PDFRef) {
    const resolved = input.pdf.context.lookup(input.entry);

    if (resolved instanceof PDFStream) {
      return tryDecodeStream({
        stream: resolved,
        pageIndex: input.pageIndex,
        maxBytes: input.maxBytes,
        streamIndex: input.streamIndex,
      });
    }

    return {
      bytes: undefined,
      warnings: [
        `PDF import: page ${String(input.pageIndex + 1)} content stream ${String(input.streamIndex + 1)} reference did not resolve to a stream; text extraction skipped for that entry.`,
      ],
    };
  }

  if (input.entry instanceof PDFStream) {
    return tryDecodeStream({
      stream: input.entry,
      pageIndex: input.pageIndex,
      maxBytes: input.maxBytes,
      streamIndex: input.streamIndex,
    });
  }

  return {
    bytes: undefined,
    warnings: [
      `PDF import: page ${String(input.pageIndex + 1)} content entry ${String(input.streamIndex + 1)} is not a stream; text extraction skipped for that entry.`,
    ],
  };
}

function tryDecodeStream(input: {
  readonly stream: PDFStream;
  readonly pageIndex: number;
  readonly maxBytes: number;
  readonly streamIndex?: number;
}): ContentReadResult {
  if (input.stream instanceof PDFRawStream) {
    const decoded = decodePdfRawStreamBoundedV1({ stream: input.stream, maxOutputBytes: input.maxBytes });

    if (decoded.status === 'decoded') return { bytes: decoded.bytes, warnings: [] };

    return {
      bytes: undefined,
      warnings: [buildDecodeWarning(input.stream, input.pageIndex, input.streamIndex, new Error(decoded.reason))],
    };
  }

  return {
    bytes: undefined,
    warnings: [buildDecodeWarning(input.stream, input.pageIndex, input.streamIndex)],
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
const TF_RE = new RegExp(`/([^\\s]+)\\s+(${FLOAT})\\s+Tf`, 'g');
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

export function scanContentStreamForText(input: {
  readonly content: string;
  readonly maxItems: number;
}): readonly ExtractedTextItem[] {
  const items: ExtractedTextItem[] = [];

  if (input.maxItems <= 0) return items;

  const blocks: Generator<string, void, undefined> = collectTextBlocks(input.content);
  let nextBlock: IteratorResult<string, void> = blocks.next();

  while (!nextBlock.done) {
    const block: string = nextBlock.value;
    const remaining = Math.max(0, input.maxItems - items.length);

    if (remaining === 0) break;
    items.push(...extractItemsFromBlock(block, remaining));
    nextBlock = blocks.next();
  }

  return items;
}

function* collectTextBlocks(content: string): Generator<string, void, undefined> {
  BT_RE.lastIndex = 0;

  let startMatch: RegExpExecArray | null;

  while ((startMatch = BT_RE.exec(content)) !== null) {
    const startIndex = startMatch.index + startMatch[0].length;

    ET_RE.lastIndex = startIndex;

    const endMatch = ET_RE.exec(content);

    if (endMatch === null) break;

    yield content.slice(startIndex, endMatch.index);

    BT_RE.lastIndex = endMatch.index + endMatch[0].length;
  }
}

interface RegexMatch {
  readonly index: number;
  readonly captures: readonly (string | undefined)[];
}

function capture(match: RegexMatch, index: number): string | undefined {
  return match.captures[index];
}

function execAll(regex: RegExp, text: string, maxMatches: number = Number.MAX_SAFE_INTEGER): readonly RegexMatch[] {
  const matches: RegexMatch[] = [];

  regex.lastIndex = 0;

  let rawMatch: RegExpExecArray | null;

  while ((rawMatch = regex.exec(text)) !== null) {
    const captures: (string | undefined)[] = [];

    for (let index = 0; index < rawMatch.length; index += 1) {
      captures.push(rawMatch[index]);
    }

    matches.push({ index: rawMatch.index, captures });

    if (matches.length >= maxMatches) break;

    if (rawMatch[0] === '') regex.lastIndex += 1;
  }

  return matches;
}

function extractItemsFromBlock(block: string, maxItems: number): readonly ExtractedTextItem[] {
  const items: ExtractedTextItem[] = [];

  let cursorX = 0;
  let cursorY = 0;
  let fontSize = 12;
  let fontName = 'Helvetica';

  const events = collectEvents(block, maxItems);

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
        fontName = event.fontName;
        break;
      case 'tj':
        if (items.length >= maxItems) return items;
        items.push({
          text: event.text,
          xPt: cursorX,
          yPt: cursorY,
          fontSizePt: fontSize,
          fontName,
        });
        break;
    }
  }

  return items;
}

type ContentEvent =
  | { readonly kind: 'tm'; readonly index: number; readonly x: number; readonly y: number }
  | { readonly kind: 'td'; readonly index: number; readonly x: number; readonly y: number }
  | { readonly kind: 'tf'; readonly index: number; readonly size: number; readonly fontName: string }
  | { readonly kind: 'tj'; readonly index: number; readonly text: string };

function collectEvents(block: string, maxEventsPerKind: number): readonly ContentEvent[] {
  const events: ContentEvent[] = [
    ...collectTmEvents(block, maxEventsPerKind),
    ...collectTdEvents(block, maxEventsPerKind),
    ...collectTfEvents(block, maxEventsPerKind),
    ...collectTjLiteralEvents(block, maxEventsPerKind),
    ...collectTjHexEvents(block, maxEventsPerKind),
    ...collectTjArrayEvents(block, maxEventsPerKind),
  ];

  events.sort((a, b) => a.index - b.index);

  return events;
}

function collectTmEvents(block: string, maxEvents: number): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TM_RE, block, maxEvents)) {
    const e = parseFloatSafe(capture(match, 5));
    const f = parseFloatSafe(capture(match, 6));

    if (e === null || f === null) continue;

    events.push({ kind: 'tm', index: match.index, x: e, y: f });
  }

  return events;
}

function collectTdEvents(block: string, maxEvents: number): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TD_RE, block, maxEvents)) {
    const x = parseFloatSafe(capture(match, 1));
    const y = parseFloatSafe(capture(match, 2));

    if (x === null || y === null) continue;

    events.push({ kind: 'td', index: match.index, x, y });
  }

  return events;
}

function collectTfEvents(block: string, maxEvents: number): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TF_RE, block, maxEvents)) {
    const fontName = capture(match, 1);
    const size = parseFloatSafe(capture(match, 2));

    if (fontName === undefined || size === null) continue;

    events.push({ kind: 'tf', index: match.index, size, fontName });
  }

  return events;
}

function collectTjLiteralEvents(block: string, maxEvents: number): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TJ_LITERAL_RE, block, maxEvents)) {
    const literal = capture(match, 1) ?? '';

    events.push({ kind: 'tj', index: match.index, text: decodePdfStringLiteral(literal) });
  }

  return events;
}

function collectTjHexEvents(block: string, maxEvents: number): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TJ_HEX_RE, block, maxEvents)) {
    const hex = capture(match, 1) ?? '';
    const decoded = decodePdfHexLiteral(hex);

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
function collectTjArrayEvents(block: string, maxEvents: number): readonly ContentEvent[] {
  const events: ContentEvent[] = [];

  for (const match of execAll(TJ_ARRAY_RE, block, maxEvents)) {
    const text = decodeTjArrayBody(capture(match, 1) ?? '');

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
