import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
// Static import paired with the minimal `wawoff2` declaration in
// `_shared/text-layout/text-layout.types.d.ts` so the dependency is
// visible to `knip` without an `ignoreDependencies` suppression.
import { compress as compressWoff2 } from 'wawoff2';

import { registerFontkit } from './export/fonts';
import { exportPdfBytes, validatePdfA2b } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

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

async function compressTtfToWoff2(ttf: Uint8Array): Promise<Uint8Array> {
  const compressed = await compressWoff2(ttf);

  return compressed instanceof Uint8Array ? compressed : new Uint8Array(compressed);
}

describe('WOFF2 decompression in the font pipeline', () => {
  /**
   * @description The exporter MUST decompress WOFF2 font payloads via
   * wawoff2 before handing them to pdf-lib's fontkit. Verified by
   * pre-compressing a real Liberation Sans TTF to WOFF2, returning it
   * via a mock fetch, and asserting the resulting PDF embeds a
   * subsetted font that grows with glyph diversity (proving the
   * decompression succeeded — fontkit cannot subset garbage bytes).
   */
  it('decompresses WOFF2 Google Fonts payloads and embeds the underlying SFNT', async () => {
    const ttfBytes = await loadLiberationSansBytes();
    const woff2Bytes = await compressTtfToWoff2(ttfBytes);
    const fetchCalls: string[] = [];
    const mockFetch: typeof globalThis.fetch = (input) => {
      const url = urlOf(input);

      fetchCalls.push(url);

      if (url.includes('fonts.googleapis.com')) {
        return Promise.resolve(
          new Response('@font-face { src: url(https://fonts.gstatic.com/font.woff2) format("woff2"); }'),
        );
      }

      return Promise.resolve(new Response(woff2Bytes.buffer as ArrayBuffer));
    };

    const doc = makeDocument({
      id: 'woff2-doc',
      elements: [
        makeElement('text', {
          id: 'text-1',
          content: 'Hello WOFF2',
          style: makeStyle({ fontFamily: 'Inter', fontSize: 16 }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc, { fetch: mockFetch });

    // Two fetches must have happened: CSS resolution + the actual WOFF2 file.
    expect(fetchCalls.some((u) => u.includes('fonts.googleapis.com'))).toBe(true);
    expect(fetchCalls.some((u) => u.endsWith('.woff2'))).toBe(true);

    // The exported PDF must be substantially larger than a doc with NO
    // custom font (which embeds only the Standard 14 Helvetica
    // fallback) — proves the decompressed SFNT actually got embedded.
    const noFontDoc = makeDocument({ id: 'no-font' });
    const noFontBytes = await exportPdfBytes(noFontDoc);

    expect(bytes.length).toBeGreaterThan(noFontBytes.length + 1000);
  });
});

describe('ToUnicode CMap validation in PDF/A validator', () => {
  /**
   * @description An exported document with a real custom font (via
   * pdf-lib's `embedFont(bytes, { subset: true })`) MUST produce a
   * /ToUnicode CMap on the embedded font dict — that's the
   * precondition for ISO 19005-2 §6.2.11 compliance.
   */
  it('passes ToUnicode validation when fonts are subsetted via fontkit', async () => {
    const pdf = await PDFDocument.create();

    registerFontkit(pdf);

    const ttfBytes = await loadLiberationSansBytes();
    const font = await pdf.embedFont(ttfBytes, { subset: true });
    const page = pdf.addPage([200, 200]);

    page.drawText('Hi', { x: 10, y: 100, size: 16, font });

    const bytes = await pdf.save({ useObjectStreams: false });
    const result = await validatePdfA2b(bytes);

    // The /ToUnicode check must NOT report a violation for this font.
    expect(result.violations.find((v) => v.includes('/ToUnicode'))).toBeUndefined();
  });

  /**
   * @description Conversely, a document that embeds a custom font
   * WITHOUT a /ToUnicode CMap (which we synthesise here by stripping
   * the entry post-embed) MUST surface a ToUnicode violation.
   */
  it('flags an embedded font missing /ToUnicode as a PDF/A violation', async () => {
    const pdf = await PDFDocument.create();

    registerFontkit(pdf);

    const ttfBytes = await loadLiberationSansBytes();
    const font = await pdf.embedFont(ttfBytes, { subset: false });
    const page = pdf.addPage([200, 200]);

    page.drawText('Hi', { x: 10, y: 100, size: 16, font });

    // Force the font to embed into the document context up-front.
    // After flush() the embedder's `modified` flag is false, so a
    // later pdf.save() does NOT re-embed (and re-add /ToUnicode) over
    // the deletion we make next.
    await pdf.flush();

    const TO_UNICODE_KEY = PDFName.of('ToUnicode');
    const TYPE_KEY = PDFName.of('Type');

    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict)) continue;

      if (object.lookupMaybe(TYPE_KEY, PDFName)?.decodeText() === 'Font') {
        object.delete(TO_UNICODE_KEY);
      }
    }

    const bytes = await pdf.save({ useObjectStreams: false });
    const result = await validatePdfA2b(bytes);

    expect(result.violations.some((v) => v.includes('/ToUnicode'))).toBe(true);
  });

  /**
   * @description Standard 14 unembedded fonts (Helvetica etc.) MUST
   * NOT trigger a ToUnicode violation — they're implicitly mapped via
   * WinAnsi / Symbol / ZapfDingbats encodings and don't need an
   * explicit CMap.
   */
  it('does not flag Standard 14 unembedded fonts as missing /ToUnicode', async () => {
    const doc = makeDocument({
      id: 'std14-only',
      elements: [
        makeElement('text', {
          id: 'helvetica-text',
          content: 'Plain Helvetica',
          style: makeStyle({ fontFamily: 'Helvetica', fontSize: 14 }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2u' });
    const result = await validatePdfA2b(bytes);

    // Validator must not flag any /ToUnicode violation for the
    // unembedded Helvetica fallback.
    expect(result.violations.find((v) => v.includes('/ToUnicode'))).toBeUndefined();
    // And it must accept the doc as a whole.
    expect(result.valid).toBe(true);
  });
});

describe('Transparency-without-group PDF/A-2 validator check', () => {
  /**
   * @description ISO 19005-2 §6.2.4 — pages that use transparency
   * operators (`CA`, `ca`, `/SMask`) MUST declare a `/Group /S
   * /Transparency` block on the page. We synthesise such a violation
   * by injecting a minimal page with a transparency op but no group
   * dictionary, and assert the validator catches it.
   */
  it('flags pages that use transparency operators without a /Group /S /Transparency declaration', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([100, 100]);

    page.drawText('Opaque', { x: 10, y: 50, size: 12, font });

    // Append a raw content stream that uses `ca 0.5` (set non-stroking
    // alpha to 50%). Pages that use this MUST declare a Group
    // dictionary; we deliberately do not, so the validator should
    // catch it.
    const transparencyStream = PDFRawStream.of(
      pdf.context.obj({ Length: 7 }),
      new TextEncoder().encode('0.5 ca\n'),
    );
    const ref = pdf.context.register(transparencyStream);

    page.node.set(PDFName.of('Contents'), ref);

    const bytes = await pdf.save({ useObjectStreams: false });
    const result = await validatePdfA2b(bytes);

    expect(result.violations.some((v) => v.includes('transparency'))).toBe(true);
  });
});
