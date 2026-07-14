import * as fontkit from 'fontkit';

/**
 * Phase 4 `_shared/fonts/subset.ts` — produces a byte-minimal font
 * subset covering exactly the Unicode codepoints a document actually
 * renders. Consumed by SVG `@font-face` embedding, PDF font
 * subsetting, and PPTX font embedding per the asset-pipeline plan.
 *
 * Inputs are `Uint8Array` bytes plus an iterable of codepoints; the
 * caller resolves a font resource to bytes before invoking. This
 * keeps the subsetter pure: no async / network / ZIP access, and
 * safe to invoke from sync export pipelines.
 *
 * Error-path contract: invalid / absent input returns `null` rather
 * than throwing (IO-D-18 no silent drops — but subsetting failure is
 * recoverable; the caller falls back to the full font embed).
 *
 * Table-preservation contract: fontkit's CFF / TTF subsetter strips
 * OS/2, name, post, and several other identification tables on
 * encode. Without these, PowerPoint (`<p:embeddedFontLst>`) and PDF
 * readers (`/FontDescriptor`) refuse the embedded font or pick a
 * fallback. After fontkit emits the glyph-data subset, this module
 * runs `mergeIdentificationTables` to copy OS/2, name, post, and
 * cmap-format-headers from the original font into the subset's
 * table directory.
 */

// See font-ops.ts for the rationale behind the fontkit typing shim.
type FontkitCreateInput = Uint8Array | Buffer;
type EncodedFontBytes = Uint8Array | ArrayBuffer | ArrayLike<number>;

const fontkitCreate: (input: FontkitCreateInput) => unknown = fontkit.create as (input: FontkitCreateInput) => unknown;

interface FontkitGlyph {
  readonly id: number;
}

interface FontkitSubset {
  includeGlyph(glyph: FontkitGlyph): void;
  encode(): EncodedFontBytes;
}

interface FontkitSubsetFont {
  createSubset(): FontkitSubset;
  glyphForCodePoint(codepoint: number): FontkitGlyph;
}

function isSubsetFont(font: unknown): font is FontkitSubsetFont {
  if (font === null || typeof font !== 'object') return false;

  const candidate = font as Record<string, unknown>;

  return typeof candidate['createSubset'] === 'function' && typeof candidate['glyphForCodePoint'] === 'function';
}

function safeOpen(bytes: Uint8Array | undefined): unknown {
  if (bytes === undefined || bytes.byteLength === 0) return null;

  try {
    return fontkitCreate(bytes);
  } catch {
    return null;
  }
}

/**
 * Subsets the font down to the glyphs required for `codepoints`.
 * Returns the encoded subset bytes, or `null` when the input is
 * malformed, the font does not expose a subsetter, or the codepoint
 * set is empty (nothing to render).
 *
 * Unknown codepoints (not present in the font's character map) are
 * silently skipped — exporters call this with every character ever
 * typed into a text element, not just the ones the font supports.
 */
export function subsetFont(bytes: Uint8Array | undefined, codepoints: Iterable<number>): Uint8Array | null {
  const font = safeOpen(bytes);

  if (font === null) return null;

  const codepointArray = Array.from(codepoints);

  if (codepointArray.length === 0) return null;

  if (!isSubsetFont(font)) return null;

  let subset: FontkitSubset;

  try {
    subset = font.createSubset();
  } catch {
    return null;
  }

  let includedAny = false;

  for (const codepoint of codepointArray) {
    try {
      const glyph = font.glyphForCodePoint(codepoint);

      if (glyph.id === 0) continue; // notdef — codepoint not in the font

      subset.includeGlyph(glyph);
      includedAny = true;
    } catch {
      // fontkit throws on malformed CMap entries — skip and continue.
    }
  }

  if (!includedAny) return null;

  try {
    const encoded = subset.encode();
    const subsetBytes = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);

    if (bytes === undefined) return subsetBytes;

    return mergeIdentificationTables(bytes, subsetBytes) ?? subsetBytes;
  } catch {
    return null;
  }
}

/**
 * Tables we copy from the source font into the subset because fontkit
 * strips them on encode. Each is required by at least one downstream
 * embedder (PPTX `<p:embeddedFontLst>`, PDF `/FontDescriptor`, or SVG
 * `@font-face` typography metadata).
 *
 * `OS/2` — embed-permission flags + weight / width class.
 * `name` — family / subfamily / postscript / unique-id records.
 * `post` — italic angle, fixed-pitch flag, glyph names (PDF needs).
 *
 * The order doesn't matter — we sort by tag before emitting.
 */
const TABLES_TO_PRESERVE: readonly string[] = ['OS/2', 'name', 'post'];

const SFNT_HEADER_BYTES = 12;
const TABLE_RECORD_BYTES = 16;
const FONT_CHECKSUM_TARGET = 0xb1b0afba; // OpenType spec: head.checkSumAdjustment = 0xB1B0AFBA - sum_of_table_checksums.

interface TableEntry {
  readonly tag: string;
  readonly checksum: number;
  readonly data: Uint8Array;
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function tagToString(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function tagFromString(tag: string): number {
  if (tag.length !== 4) throw new Error(`Invalid OpenType tag: "${tag}"`);

  return (
    ((tag.charCodeAt(0) & 0xff) << 24) |
    ((tag.charCodeAt(1) & 0xff) << 16) |
    ((tag.charCodeAt(2) & 0xff) << 8) |
    (tag.charCodeAt(3) & 0xff)
  );
}

function paddedLength(length: number): number {
  return (length + 3) & ~3;
}

function tableChecksum(data: Uint8Array): number {
  let sum = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const wholeWords = data.byteLength >>> 2;

  for (let i = 0; i < wholeWords; i += 1) {
    sum = (sum + view.getUint32(i * 4, false)) >>> 0;
  }

  // Tail bytes — pad with zeros to a 32-bit word.
  const tailStart = wholeWords * 4;
  const tail = data.byteLength - tailStart;

  if (tail > 0) {
    let last = 0;

    for (let i = 0; i < tail; i += 1) {
      const byte = data[tailStart + i] ?? 0;

      last = ((last << 8) | byte) >>> 0;
    }

    last = (last << ((4 - tail) * 8)) >>> 0;
    sum = (sum + last) >>> 0;
  }

  return sum >>> 0;
}

function readTableEntries(bytes: Uint8Array): readonly TableEntry[] | null {
  if (bytes.byteLength < SFNT_HEADER_BYTES) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = readU16(view, 4);

  if (bytes.byteLength < SFNT_HEADER_BYTES + numTables * TABLE_RECORD_BYTES) return null;

  const entries: TableEntry[] = [];

  for (let i = 0; i < numTables; i += 1) {
    const recordOffset = SFNT_HEADER_BYTES + i * TABLE_RECORD_BYTES;
    const tag = tagToString(view, recordOffset);
    const checksum = readU32(view, recordOffset + 4);
    const offset = readU32(view, recordOffset + 8);
    const length = readU32(view, recordOffset + 12);

    if (offset + length > bytes.byteLength) return null;

    entries.push({ tag, checksum, data: bytes.slice(offset, offset + length) });
  }

  return entries;
}

/**
 * Re-emit the subset with OS/2, name, and post tables copied from the
 * source font. fontkit strips these on encode, but PPTX
 * `<p:embeddedFontLst>` and PDF `/FontDescriptor` require them. The
 * tables are copied verbatim (we never modify the source font's
 * identification metadata, only its glyph set), so checksums need
 * only be recomputed for the unchanged source bytes.
 */
function mergeIdentificationTables(sourceBytes: Uint8Array, subsetBytes: Uint8Array): Uint8Array | null {
  const sourceEntries = readTableEntries(sourceBytes);
  const subsetEntries = readTableEntries(subsetBytes);

  if (sourceEntries === null || subsetEntries === null) return null;

  const merged = new Map<string, TableEntry>();

  for (const entry of subsetEntries) {
    merged.set(entry.tag, entry);
  }

  for (const tag of TABLES_TO_PRESERVE) {
    const sourceEntry = sourceEntries.find((e) => e.tag === tag);

    if (sourceEntry === undefined) continue;

    merged.set(tag, sourceEntry);
  }

  return emitFont(subsetBytes.slice(0, 4), Array.from(merged.values()));
}

function compareTags(a: number, b: number): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;

  return 0;
}

function emitFont(sfntVersion: Uint8Array, entries: readonly TableEntry[]): Uint8Array {
  const sortedTagged = entries
    .map((entry) => ({ entry, tagU32: tagFromString(entry.tag) }))
    .sort((a, b) => compareTags(a.tagU32, b.tagU32));
  const numTables = sortedTagged.length;
  const directoryBytes = SFNT_HEADER_BYTES + numTables * TABLE_RECORD_BYTES;
  let totalSize = directoryBytes;

  for (const { entry } of sortedTagged) {
    totalSize += paddedLength(entry.data.byteLength);
  }

  const out = new Uint8Array(totalSize);
  const outView = new DataView(out.buffer);

  // Offset Table.
  out.set(sfntVersion, 0);
  outView.setUint16(4, numTables, false);

  const entrySelector = numTables === 0 ? 0 : Math.floor(Math.log2(numTables));
  const searchRange = (1 << entrySelector) * 16;
  const rangeShift = numTables * 16 - searchRange;

  outView.setUint16(6, searchRange, false);
  outView.setUint16(8, entrySelector, false);
  outView.setUint16(10, rangeShift, false);

  // Track the head table's location so we can zero its
  // checkSumAdjustment, then patch it after computing the total
  // checksum.
  let headTableOffset = -1;
  let cursor = directoryBytes;

  for (let i = 0; i < numTables; i += 1) {
    const tagged = sortedTagged[i];

    if (tagged === undefined) continue;

    const { entry } = tagged;
    const recordOffset = SFNT_HEADER_BYTES + i * TABLE_RECORD_BYTES;
    const tagU32 = tagFromString(entry.tag);
    const length = entry.data.byteLength;

    outView.setUint32(recordOffset, tagU32, false);
    outView.setUint32(recordOffset + 4, tableChecksum(entry.data), false);
    outView.setUint32(recordOffset + 8, cursor, false);
    outView.setUint32(recordOffset + 12, length, false);

    out.set(entry.data, cursor);

    if (entry.tag === 'head') {
      headTableOffset = cursor;
      // Zero the checkSumAdjustment field (offset 8 within head)
      // before computing the file checksum.
      outView.setUint32(cursor + 8, 0, false);
    }

    cursor += paddedLength(length);
  }

  if (headTableOffset >= 0) {
    const totalChecksum = tableChecksum(out);
    const adjustment = (FONT_CHECKSUM_TARGET - totalChecksum) >>> 0;

    outView.setUint32(headTableOffset + 8, adjustment, false);
  }

  return out;
}
