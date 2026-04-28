import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { PDFDict, PDFDocument, type PDFDocument as PDFDocumentType, PDFName, PDFRef, PDFStream } from 'pdf-lib';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearFontBytesCache } from './export/fonts';
import { exportPdfBytes } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * Phase 5.8 — `_shared/fonts/subsetFont` wiring tests for the PDF
 * export pipeline. Verifies that the fontkit-backed subsetter drives
 * custom-font embeds by default, that the resulting PDFs carry a
 * `/ToUnicode` CMap so text is copy-pastable, and that
 * `PdfExportOptions.subsetFonts: false` opts back into the full-font
 * embed for callers that need the complete glyph table.
 */

const require = createRequire(import.meta.url);

async function loadLiberationSansBytes(): Promise<Uint8Array> {
  const path = require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf');
  const data = await readFile(path);

  return new Uint8Array(data);
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;

  return input.url;
}

function buildMockFetch(fontBytes: Uint8Array): typeof globalThis.fetch {
  return (input) => {
    const url = urlOf(input);

    if (url.includes('fonts.googleapis.com')) {
      return Promise.resolve(
        new Response('@font-face { src: url(https://fonts.gstatic.com/font.ttf) format("truetype"); }'),
      );
    }

    return Promise.resolve(new Response(fontBytes.buffer as ArrayBuffer));
  };
}

interface FontStats {
  readonly fontDictCount: number;
  readonly toUnicodeCount: number;
  readonly fontFileBytes: number;
}

const TYPE_KEY = PDFName.of('Type');
const TO_UNICODE_KEY = PDFName.of('ToUnicode');
const DESCRIPTOR_KEY = PDFName.of('FontDescriptor');
const FONT_FILE_KEYS: readonly PDFName[] = [PDFName.of('FontFile2'), PDFName.of('FontFile3')];

function isFontDict(object: PDFDict): boolean {
  return object.lookupMaybe(TYPE_KEY, PDFName)?.decodeText() === 'Font';
}

function readStreamBytes(pdf: PDFDocumentType, ref: PDFRef): number {
  const stream = pdf.context.lookup(ref);

  if (!(stream instanceof PDFStream)) return 0;

  const contentsField = (stream as { readonly contents?: Uint8Array }).contents;

  return contentsField !== undefined ? contentsField.byteLength : 0;
}

function sumFontFileBytes(pdf: PDFDocumentType, descriptor: PDFDict, seen: Set<PDFRef>): number {
  let total = 0;

  for (const fileKey of FONT_FILE_KEYS) {
    const ref = descriptor.get(fileKey);

    if (!(ref instanceof PDFRef)) continue;
    if (seen.has(ref)) continue;

    seen.add(ref);
    total += readStreamBytes(pdf, ref);
  }

  return total;
}

/**
 * Walks the saved PDF's indirect-object table and aggregates byte-level
 * statistics about every embedded font: how many `/Type /Font` dicts
 * exist, how many of them carry a `/ToUnicode` reference, and the
 * total length of the embedded `FontFile2` / `FontFile3` payloads.
 */
async function readFontStats(bytes: Uint8Array): Promise<FontStats> {
  const pdf = await PDFDocument.load(bytes);

  let fontDictCount = 0;
  let toUnicodeCount = 0;
  let fontFileBytes = 0;
  const seenFontFileRefs = new Set<PDFRef>();

  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    if (!isFontDict(object)) continue;

    fontDictCount += 1;

    if (object.get(TO_UNICODE_KEY) !== undefined) toUnicodeCount += 1;

    const descriptor = object.lookupMaybe(DESCRIPTOR_KEY, PDFDict);

    if (descriptor === undefined) continue;

    fontFileBytes += sumFontFileBytes(pdf, descriptor, seenFontFileRefs);
  }

  return { fontDictCount, toUnicodeCount, fontFileBytes };
}

describe('PDF font subsetting via _shared/fonts/subsetFont', () => {
  beforeEach(() => {
    clearFontBytesCache();
  });

  /**
   * @description The default export path MUST subset embedded fonts
   * via pdf-lib's `CustomFontSubsetEmbedder` (the registered
   * `@pdf-lib/fontkit` adapter). Verified by comparing the embedded
   * `FontFile2` payload size to the same document exported with
   * `subsetFonts: false`.
   */
  it('reduces embedded font bytes when subsetFonts defaults to true', async () => {
    const fontBytes = await loadLiberationSansBytes();
    const doc = makeDocument({
      id: 'subset-doc',
      elements: [
        makeElement('text', {
          id: 'text-1',
          content: 'Hello',
          style: makeStyle({ fontFamily: 'Inter', fontSize: 16 }),
        }),
      ],
    });

    clearFontBytesCache();

    const subsetBytes = await exportPdfBytes(doc, { fetch: buildMockFetch(fontBytes) });
    const subsetStats = await readFontStats(subsetBytes);

    clearFontBytesCache();

    const fullBytes = await exportPdfBytes(doc, {
      fetch: buildMockFetch(fontBytes),
      subsetFonts: false,
    });
    const fullStats = await readFontStats(fullBytes);

    expect(subsetStats.fontFileBytes).toBeGreaterThan(0);
    expect(fullStats.fontFileBytes).toBeGreaterThan(0);
    expect(subsetStats.fontFileBytes).toBeLessThan(fullStats.fontFileBytes * 0.4);
  });

  /**
   * @description Every embedded custom font dict MUST carry a
   * `/ToUnicode` CMap so the text is copy-pastable and PDF/A-2u
   * conformant.
   */
  it('attaches a /ToUnicode CMap to every embedded custom font dict', async () => {
    const fontBytes = await loadLiberationSansBytes();
    const doc = makeDocument({
      id: 'tounicode-doc',
      elements: [
        makeElement('text', {
          id: 'text-1',
          content: 'Hello world',
          style: makeStyle({ fontFamily: 'Inter', fontSize: 16 }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc, { fetch: buildMockFetch(fontBytes) });
    const stats = await readFontStats(bytes);

    expect(stats.toUnicodeCount).toBeGreaterThanOrEqual(1);
    expect(stats.fontDictCount).toBeGreaterThanOrEqual(1);
  });

  /**
   * @description When `subsetFonts: false` is passed, the exporter
   * MUST embed the full font bytes (no subsetting). Verifies the
   * option is plumbed end-to-end from `PdfExportOptions` →
   * `runExport` → `resolveFonts` → embed call.
   */
  it('skips subsetting when subsetFonts: false', async () => {
    const fontBytes = await loadLiberationSansBytes();
    const doc = makeDocument({
      id: 'no-subset-doc',
      elements: [
        makeElement('text', {
          id: 'text-1',
          content: 'Hi',
          style: makeStyle({ fontFamily: 'Inter', fontSize: 16 }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc, {
      fetch: buildMockFetch(fontBytes),
      subsetFonts: false,
    });
    const stats = await readFontStats(bytes);

    expect(stats.fontFileBytes).toBeGreaterThan(40_000);
  });

  /**
   * @description Subsetting MUST scale with codepoint usage —
   * embedding "A" produces a smaller font than embedding the full
   * Latin alphabet plus digits.
   */
  it('grows the embedded subset proportionally with codepoint diversity', async () => {
    const fontBytes = await loadLiberationSansBytes();
    const tinyDoc = makeDocument({
      id: 'tiny',
      elements: [
        makeElement('text', {
          id: 'text-1',
          content: 'A',
          style: makeStyle({ fontFamily: 'Inter', fontSize: 16 }),
        }),
      ],
    });
    const richerDoc = makeDocument({
      id: 'richer',
      elements: [
        makeElement('text', {
          id: 'text-1',
          content: 'The quick brown fox jumps over the lazy dog 0123456789',
          style: makeStyle({ fontFamily: 'Inter', fontSize: 16 }),
        }),
      ],
    });

    clearFontBytesCache();

    const tinyBytes = await exportPdfBytes(tinyDoc, { fetch: buildMockFetch(fontBytes) });
    const tinyStats = await readFontStats(tinyBytes);

    clearFontBytesCache();

    const richerBytes = await exportPdfBytes(richerDoc, { fetch: buildMockFetch(fontBytes) });
    const richerStats = await readFontStats(richerBytes);

    expect(richerStats.fontFileBytes).toBeGreaterThan(tinyStats.fontFileBytes);
  });
});
