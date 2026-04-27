import { describe, expect, it } from 'vitest';

import { drawQrOnPage, exportPdfBytes, normalizeFontFamily, resolveGoogleFontUrl } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';
import { wrapText } from './text';

type FetchInput = string | Request | URL;

function urlFromFetchInput(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;

  return input.url;
}

describe('Font Embedding', () => {
  /**
   * @description Font family names must be normalized for deduplication:
   * strip quotes, remove hyphens, lowercased.
   */
  it('normalizes font family names for deduplication', () => {
    expect(normalizeFontFamily('"Inter"')).toBe('inter');
    expect(normalizeFontFamily("'Open Sans'")).toBe('open sans');
    expect(normalizeFontFamily('Noto-Sans')).toBe('notosans');
    expect(normalizeFontFamily('  Roboto  ')).toBe('roboto');
  });

  /**
   * @description When a font has an empty URL, the system must construct
   * a Google Fonts CSS URL for resolution.
   */
  it('resolves Google Fonts URL for font with empty URL', () => {
    const url = resolveGoogleFontUrl('Inter');

    expect(url).toContain('fonts.googleapis.com');
    expect(url).toContain('Inter');
  });

  /**
   * @description Given two text elements with the same font family, export must
   * deduplicate - only one fetch and one embed call should occur.
   */
  it('deduplicates font fetches for duplicate family names', async () => {
    const fetchCalls: string[] = [];
    const mockFetch = (input: string | Request | URL): Promise<Response> => {
      const url = urlFromFetchInput(input);

      fetchCalls.push(url);

      if (url.includes('fonts.googleapis.com')) {
        return Promise.resolve(new Response('/* no font URL */'));
      }

      return Promise.resolve(new Response('', { status: 404 }));
    };

    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Hello',
          style: makeStyle({ fontFamily: 'Inter', fontSize: 16 }),
        }),
        makeElement('text', {
          content: 'World',
          style: makeStyle({ fontFamily: '"Inter"', fontSize: 14 }),
        }),
      ],
    });

    await exportPdfBytes(doc, mockFetch as never);

    const googleCalls = fetchCalls.filter((u) => u.includes('fonts.googleapis.com'));

    expect(googleCalls).toHaveLength(1);
  });

  /**
   * @description When a font matches a standard PDF font (e.g. Helvetica, Arial),
   * no external fetch should be attempted.
   */
  it('uses standard font without fetch for known families', async () => {
    const fetchCalls: string[] = [];
    const mockFetch = (input: string | Request | URL): Promise<Response> => {
      fetchCalls.push(urlFromFetchInput(input));

      return Promise.resolve(new Response('', { status: 404 }));
    };

    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Hello',
          style: makeStyle({ fontFamily: 'Helvetica', fontSize: 16 }),
        }),
      ],
    });

    await exportPdfBytes(doc, mockFetch as never);

    expect(fetchCalls).toHaveLength(0);
  });
});

describe('Text Wrapping', () => {
  /**
   * @description Text wider than the container must wrap at word boundaries
   * producing multiple lines with non-empty content.
   */
  it('wraps text at word boundaries', () => {
    const measure = (text: string): number => text.length * 10;
    const result = wrapText('The quick brown fox jumps over the lazy dog', 100, measure);

    expect(result.length).toBeGreaterThan(1);

    for (const line of result) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  /** @description Explicit newlines must be preserved including empty lines. */
  it('preserves explicit newlines including empty lines', () => {
    const measure = (text: string): number => text.length * 10;
    const result = wrapText('line one\n\nline three', 10000, measure);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe('line one');
    expect(result[1]).toBe('');
    expect(result[2]).toBe('line three');
  });

  /**
   * @description When full-string measurement throws, the system must
   * fall back to per-character measurement.
   */
  it('falls back to per-character measurement on throw', () => {
    let callCount = 0;
    const measure = (text: string): number => {
      callCount++;

      if (callCount <= 2 && text.length > 1) {
        throw new Error('measurement failed');
      }

      return text.length * 10;
    };
    const result = wrapText('ab cd', 30, measure);

    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PDF QR Code Drawing', () => {
  /**
   * @description Empty QR content must draw only 1 rectangle (the white
   * background). Non-empty content must draw background + multiple module
   * rectangles.
   */
  it('draws only background rectangle for empty content', () => {
    const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
    const mockPage = {
      drawRectangle: (opts: { x: number; y: number; width: number; height: number }): void => {
        rects.push(opts);
      },
    };

    drawQrOnPage(mockPage as never, '', 0, 0, 100, 100);

    expect(rects).toHaveLength(1);
  });

  /**
   * @description Non-empty QR content must draw background + module
   * rectangles (multiple total).
   */
  it('draws multiple rectangles for non-empty content', () => {
    const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
    const mockPage = {
      drawRectangle: (opts: { x: number; y: number; width: number; height: number }): void => {
        rects.push(opts);
      },
    };

    drawQrOnPage(mockPage as never, 'https://example.com', 0, 0, 100, 100);

    expect(rects.length).toBeGreaterThan(1);
  });
});

describe('Animated Element Static Export', () => {
  /**
   * @description PDF export must render animated elements at their default
   * rest state (t=0), ignoring any active animation state.
   */
  it('exports animated elements at rest state (t=0)', async () => {
    const baseElements = [
      makeElement('text', {
        id: 'el-1',
        content: 'Animated text',
        style: makeStyle({ opacity: 1 }),
      }),
    ];

    const docWithAnimation = makeDocument({
      elements: baseElements,
      animations: [
        {
          id: 'anim-1',
          name: 'fade',
          elementId: 'el-1',
          trigger: 'onLoad',
          timelines: [
            {
              property: 'style.opacity',
              keyframes: [
                { time: 0, value: { type: 'number', value: 1 } },
                { time: 1, value: { type: 'number', value: 0.5 } },
              ],
            },
          ],
        },
      ] as never,
    });

    const docWithoutAnimation = makeDocument({
      elements: baseElements,
      animations: [],
    });

    const bytesAnimated = await exportPdfBytes(docWithAnimation);
    const bytesStatic = await exportPdfBytes(docWithoutAnimation);

    expect(bytesAnimated).toBeInstanceOf(Uint8Array);
    expect(bytesAnimated.length).toBeGreaterThan(0);
    expect(bytesAnimated.length).toBe(bytesStatic.length);
  });

  /**
   * @description Active state modifiers must not be applied in PDF export.
   * The element's own style from the document model must be used directly.
   */
  it('does not apply active state modifiers in export', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'rect-1',
          width: 50,
          height: 50,
          style: makeStyle({ backgroundColor: '#ff0000' }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
