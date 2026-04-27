import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { beforeEach, describe, expect, it } from 'vitest';

import { clearFontBytesCache } from './export/fonts';
import { exportPdfBytes } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

const require = createRequire(import.meta.url);

interface FontFetchObservation {
  readonly cssFetches: number;
  readonly fontFetches: number;
}

async function loadLiberationSansBytes(): Promise<Uint8Array> {
  const data = await readFile(require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'));

  return new Uint8Array(data);
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;

  return input.url;
}

async function exportWithObservedFetches(
  fontBytes: Uint8Array,
): Promise<FontFetchObservation> {
  const observation = { cssFetches: 0, fontFetches: 0 };
  const mockFetch: typeof globalThis.fetch = (input) => {
    const url = urlOf(input);

    if (url.includes('fonts.googleapis.com')) {
      observation.cssFetches += 1;

      return Promise.resolve(
        new Response('@font-face { src: url(https://example.com/font.ttf) format("truetype"); }'),
      );
    }

    observation.fontFetches += 1;

    return Promise.resolve(new Response(fontBytes.buffer as ArrayBuffer));
  };

  const doc = makeDocument({
    id: 'cache-doc',
    elements: [
      makeElement('text', {
        id: 'text-1',
        content: 'Hi',
        style: makeStyle({ fontFamily: 'Inter', fontSize: 16 }),
      }),
    ],
  });

  await exportPdfBytes(doc, { fetch: mockFetch });

  return observation;
}

describe('PDF font-bytes cache', () => {
  beforeEach(() => {
    clearFontBytesCache();
  });

  /**
   * @description The first export of a Google Font MUST hit the
   * network for both the CSS resolution AND the font URL. Baseline
   * for the cache-hit test below.
   */
  it('fetches CSS + font bytes on first export', async () => {
    const fontBytes = await loadLiberationSansBytes();
    const observation = await exportWithObservedFetches(fontBytes);

    expect(observation.cssFetches).toBe(1);
    expect(observation.fontFetches).toBe(1);
  });

  /**
   * @description The second export of the same family MUST NOT hit
   * the network at all — the cached SFNT bytes are reused. This is
   * the cache-hit invariant: zero CSS fetches, zero font fetches.
   */
  it('reuses cached font bytes on subsequent exports', async () => {
    const fontBytes = await loadLiberationSansBytes();

    // Warm the cache.
    await exportWithObservedFetches(fontBytes);

    // Second pass — must be cache-only.
    const observation = await exportWithObservedFetches(fontBytes);

    expect(observation.cssFetches).toBe(0);
    expect(observation.fontFetches).toBe(0);
  });

  /**
   * @description `clearFontBytesCache` MUST flush the cache so the
   * NEXT export re-fetches. Verifies the test seam works.
   */
  it('re-fetches after clearFontBytesCache', async () => {
    const fontBytes = await loadLiberationSansBytes();

    await exportWithObservedFetches(fontBytes);
    clearFontBytesCache();

    const observation = await exportWithObservedFetches(fontBytes);

    expect(observation.cssFetches).toBe(1);
    expect(observation.fontFetches).toBe(1);
  });
});
