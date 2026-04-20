import type { BroadsetElementStyle } from '@broadset/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportPdfBytes } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

const drawCalls = {
  rectangles: 0,
  images: 0,
  text: [] as string[],
};

vi.mock('@libpdf/core', () => {
  const page = {
    drawRectangle: (): void => {
      drawCalls.rectangles += 1;
    },
    drawImage: (): void => {
      drawCalls.images += 1;
    },
    drawText: (text: string): void => {
      drawCalls.text.push(text);
    },
    drawEllipse: (): void => {},
    drawSvgPath: (): void => {},
  };

  const pdfInstance = {
    addPage: () => page,
    save: () => new Uint8Array([1, 2, 3]),
    embedImage: () => ({ id: 'img-1' }),
    embedFont: () => ({ widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5 }),
  };

  return {
    PDF: {
      create: () => pdfInstance,
    },
    StandardFonts: {
      Helvetica: 'Helvetica',
      TimesRoman: 'TimesRoman',
      Courier: 'Courier',
    },
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
  };
});

describe('PDF Render Fallback Upgrades', () => {
  beforeEach(() => {
    drawCalls.rectangles = 0;
    drawCalls.images = 0;
    drawCalls.text = [];
  });

  /** @description URL images should be fetched and embedded instead of immediately falling back to placeholders. */
  it('embeds fetched URL images during export', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const mockFetch = (): Promise<Response> =>
      Promise.resolve({
        ok: true,
        headers: {
          get: () => 'image/png',
        },
        arrayBuffer: () => Promise.resolve(pngBytes.buffer),
      } as unknown as Response);

    const doc = makeDocument({
      elements: [
        makeElement('image', {
          content: 'https://example.com/photo.png',
          style: makeStyle() as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc, mockFetch as never);

    expect(bytes.length).toBeGreaterThan(0);
    expect(drawCalls.images).toBeGreaterThan(0);
  });

  /** @description Clock and ticker elements should render deterministic text snapshots instead of generic rectangle placeholders only. */
  it('renders text snapshots for clock and ticker elements', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('clock', {
          content: '12:34',
          style: makeStyle({ backgroundColor: '#ffffff' }) as BroadsetElementStyle,
        }),
        makeElement('ticker', {
          content: 'Breaking News',
          style: makeStyle({ backgroundColor: '#ffffff' }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);
    expect(drawCalls.text).toContain('12:34');
    expect(drawCalls.text).toContain('Breaking News');
  });
});
