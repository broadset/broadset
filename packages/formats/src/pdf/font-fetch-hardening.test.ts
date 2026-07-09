import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { beforeEach, describe, expect, it } from 'vitest';

import { clearFontBytesCache } from './export/fonts';
import { exportPdfBytes, exportPdfWithPreflight } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

const require = createRequire(import.meta.url);

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;

  return input.url;
}

function responseBodyFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function loadLiberationSansBytes(): Promise<Uint8Array> {
  const data = await readFile(require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'));

  return new Uint8Array(data);
}

function customFontDocument(fontFamily: string = 'Inter') {
  return makeDocument({
    id: 'font-fetch-hardening-doc',
    elements: [
      makeElement('text', {
        id: 'custom-font-text',
        content: 'Hardened fetch',
        style: makeStyle({ fontFamily, fontSize: 18 }),
      }),
    ],
  });
}

describe('PDF Google Fonts fetch hardening', () => {
  beforeEach(() => {
    clearFontBytesCache();
  });

  /**
   * @description PdfExportOptions.fontMaxBytes MUST cap both CSS and
   * static font payloads so callers can lower the default resource
   * budget for constrained import/export workers.
   */
  it('uses PdfExportOptions.fontMaxBytes for fetched font assets', async () => {
    const fontBytes = new Uint8Array(256);
    const fetch: typeof globalThis.fetch = (input) => {
      const url = urlOf(input);

      if (url.includes('fonts.googleapis.com')) {
        return Promise.resolve(
          new Response('@font-face { src: url(https://fonts.gstatic.com/inter.ttf) format("truetype"); }'),
        );
      }

      return Promise.resolve(new Response(responseBodyFromBytes(fontBytes)));
    };

    const result = await exportPdfWithPreflight(customFontDocument(), {
      fetch,
      fontMaxBytes: 128,
    });

    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes('font asset fetch failed (max-bytes-exceeded)'))).toBe(
      true,
    );
  });

  /**
   * @description The CSS endpoint host is not a valid static font
   * asset host. A compromised CSS response must not pivot the exporter
   * into fetching arbitrary bytes from fonts.googleapis.com.
   */
  it('allows Google Fonts CSS only from googleapis and static font bytes only from gstatic', async () => {
    const fetchedUrls: string[] = [];
    const fetch: typeof globalThis.fetch = (input) => {
      const url = urlOf(input);

      fetchedUrls.push(url);

      if (url === 'https://fonts.googleapis.com/css2?family=Inter&display=swap') {
        return Promise.resolve(
          new Response('@font-face { src: url(https://fonts.googleapis.com/compromised.ttf) format("truetype"); }'),
        );
      }

      return Promise.resolve(new Response(new Uint8Array([0, 1, 2, 3])));
    };

    const result = await exportPdfWithPreflight(customFontDocument(), { fetch });

    expect(result.warnings.some((warning) => warning.includes('font asset fetch failed (host-not-allowed)'))).toBe(
      true,
    );
    expect(fetchedUrls).toEqual(['https://fonts.googleapis.com/css2?family=Inter&display=swap']);
  });

  /**
   * @description Real CSS commonly quotes url(...) values. The exporter
   * must unquote the extracted URL before applying scheme / host
   * validation and fetching the font bytes.
   */
  it('extracts quoted Google Fonts asset URLs from CSS', async () => {
    const fontBytes = await loadLiberationSansBytes();
    const fetchedUrls: string[] = [];
    const fetch: typeof globalThis.fetch = (input) => {
      const url = urlOf(input);

      fetchedUrls.push(url);

      if (url.includes('fonts.googleapis.com')) {
        return Promise.resolve(
          new Response('@font-face { src: url("https://fonts.gstatic.com/inter.ttf") format("truetype"); }'),
        );
      }

      return Promise.resolve(new Response(responseBodyFromBytes(fontBytes)));
    };

    const bytes = await exportPdfBytes(customFontDocument('Quoted Inter'), { fetch });

    expect(bytes.length).toBeGreaterThan(0);
    expect(fetchedUrls).toEqual([
      'https://fonts.googleapis.com/css2?family=Quoted%20Inter&display=swap',
      'https://fonts.gstatic.com/inter.ttf',
    ]);
  });

  /**
   * @description Cached Google Font bytes must still respect a later,
   * stricter PdfExportOptions.fontMaxBytes setting. Otherwise one
   * permissive export in a long-lived worker could bypass a
   * constrained export's resource budget.
   */
  it('applies fontMaxBytes to cached font bytes', async () => {
    const fontBytes = await loadLiberationSansBytes();
    const doc = customFontDocument('Cached Inter');
    const fetch: typeof globalThis.fetch = (input) => {
      const url = urlOf(input);

      if (url.includes('fonts.googleapis.com')) {
        return Promise.resolve(
          new Response('@font-face { src: url(https://fonts.gstatic.com/cached-inter.ttf) format("truetype"); }'),
        );
      }

      return Promise.resolve(new Response(responseBodyFromBytes(fontBytes)));
    };

    await exportPdfBytes(doc, { fetch });

    const result = await exportPdfWithPreflight(doc, {
      fetch,
      fontMaxBytes: 1,
    });

    expect(result.warnings.some((warning) => /cached font bytes.*configured cap/i.test(warning))).toBe(true);
  });
});
