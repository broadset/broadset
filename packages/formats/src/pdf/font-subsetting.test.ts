import type { PDFDocument, PDFFont } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { registerFontkit, resolveIdentity } from './export/fonts';

interface EmbedCall {
  readonly family: string | Uint8Array;
  readonly options: { readonly subset?: boolean } | undefined;
}

interface MockPdf {
  readonly fontkitRegistrations: number;
  readonly embedCalls: ReadonlyArray<EmbedCall>;
  readonly pdf: PDFDocument;
}

function urlForFetchInput(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;

  return input.url;
}

function createMockPdf(): MockPdf {
  const embedCalls: EmbedCall[] = [];
  let fontkitRegistrations = 0;
  const pdf = {
    registerFontkit: (): void => {
      fontkitRegistrations += 1;
    },
    embedFont: (
      family: string | Uint8Array,
      options?: { readonly subset?: boolean },
    ): Promise<PDFFont> => {
      embedCalls.push({ family, options });

      return Promise.resolve({ id: 'mock-font' } as unknown as PDFFont);
    },
  } as unknown as PDFDocument;

  return {
    get fontkitRegistrations(): number {
      return fontkitRegistrations;
    },
    embedCalls,
    pdf,
  };
}

describe('Font subsetting wiring', () => {
  /**
   * @description `registerFontkit` calls through to pdf-lib's
   * `pdf.registerFontkit` adapter so subsequent `embedFont(bytes, { subset: true })`
   * calls can subset the font to the glyphs actually referenced.
   */
  it('registers @pdf-lib/fontkit on the PDFDocument', () => {
    const mock = createMockPdf();

    registerFontkit(mock.pdf);

    expect(mock.fontkitRegistrations).toBe(1);
  });

  /**
   * @description Standard 14 fonts (Helvetica, Times, Courier) are embedded
   * by name without `subset: true` — they don't need subsetting because the
   * Standard 14 set is always-resident in the PDF reader.
   */
  it('embeds Standard 14 fonts by name without subsetting', async () => {
    const mock = createMockPdf();

    await resolveIdentity('Helvetica', false, false, mock.pdf, undefined);

    expect(mock.embedCalls).toHaveLength(1);

    const [call] = mock.embedCalls;

    if (call === undefined) throw new Error('expected one embedFont call');

    expect(typeof call.family).toBe('string');
    expect(call.options).toBeUndefined();
  });

  /**
   * @description When a custom font is fetched from Google Fonts, the embed
   * MUST pass `{ subset: true }` so the embedded font is reduced to only the
   * glyphs the document actually references — typical reduction is ~200 KB → ~10 KB.
   */
  it('passes subset:true when embedding a fetched Google Font', async () => {
    const mock = createMockPdf();
    const fontBytes = new Uint8Array([0x00, 0x01, 0x00, 0x00]);
    const mockFetch: typeof globalThis.fetch = (input) => {
      const url = urlForFetchInput(input);

      if (url.includes('fonts.googleapis.com')) {
        return Promise.resolve(
          new Response('@font-face { src: url(https://example.com/font.ttf) format("truetype"); }'),
        );
      }

      return Promise.resolve(new Response(fontBytes.buffer));
    };

    await resolveIdentity('Inter', false, false, mock.pdf, mockFetch);

    const subsettedCall = mock.embedCalls.find((c) => c.options?.subset === true);

    expect(subsettedCall).toBeDefined();
    expect(subsettedCall?.family).toBeInstanceOf(Uint8Array);
  });

  /**
   * @description When the Google Font fetch yields no parseable URL, the
   * exporter MUST fall back to the matching Standard 14 variant rather than
   * leaving the document with an unembedded font reference.
   */
  it('falls back to Helvetica when Google Font CSS yields no font URL', async () => {
    const mock = createMockPdf();
    const mockFetch: typeof globalThis.fetch = () =>
      Promise.resolve(new Response('/* no font URL parseable */'));

    await resolveIdentity('UnknownFamily123', true, true, mock.pdf, mockFetch);

    const fallbackCall = mock.embedCalls.find((c) => typeof c.family === 'string');

    expect(fallbackCall).toBeDefined();
    expect(fallbackCall?.family).toBe('Helvetica-BoldOblique');
  });
});
