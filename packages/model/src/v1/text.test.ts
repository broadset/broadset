import { describe, expect, it } from 'vitest';

import { textBodySchema } from './text';

const black = { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 } as const;

function createTextBody(): object {
  return {
    paragraphs: [
      {
        id: 'paragraph-a',
        properties: {
          alignment: 'start',
          direction: 'auto',
          lineSpacing: { kind: 'multiple', value: 1.2 },
          spaceBefore: 0,
          spaceAfter: 4,
          firstLineIndent: 0,
          startIndent: 0,
          endIndent: 0,
          tabs: [{ id: 'tab-a', position: 24, alignment: 'decimal', leader: 'dots' }],
          list: { kind: 'ordered', level: 1, startAt: 1, style: 'decimal' },
          hyphenation: 'auto',
          keepTogether: true,
          keepWithNext: false,
          widowControl: true,
        },
        runs: [
          {
            id: 'run-a',
            text: 'Hello, 世界 👋',
            properties: {
              fontFamilyId: 'font-family-a',
              fontFaceId: 'font-face-a',
              size: 18,
              color: black,
              weight: 500,
              variationAxes: [{ tag: 'wght', value: 500 }],
              openTypeFeatures: [{ tag: 'liga', value: 1 }],
              language: 'en-US',
              script: 'Latn',
              direction: 'ltr',
              decoration: { underline: true, strikeThrough: false, style: 'solid', color: black },
              baselineShift: 0,
              tracking: 0.2,
              hyperlink: 'https://example.com/',
              semanticRole: 'strong',
            },
          },
        ],
      },
    ],
  };
}

describe('textBodySchema', () => {
  it('accepts structured inert Unicode with stable paragraph and run ids', () => {
    const body = createTextBody();

    expect(textBodySchema.parse(body)).toEqual(body);
  });

  it('rejects duplicate paragraph and run ids', () => {
    const body = createTextBody();
    const paragraph = textBodySchema.parse(body).paragraphs[0];

    expect(paragraph).toBeDefined();
    expect(textBodySchema.safeParse({ paragraphs: [paragraph, paragraph] }).success).toBe(false);
    expect(
      textBodySchema.safeParse({ paragraphs: [{ ...paragraph, runs: [paragraph?.runs[0], paragraph?.runs[0]] }] })
        .success,
    ).toBe(false);
  });

  it('rejects authored executable markup and unknown shaped data', () => {
    const body = createTextBody();
    const paragraph = textBodySchema.parse(body).paragraphs[0];
    const run = paragraph?.runs[0];

    expect(
      textBodySchema.safeParse({
        paragraphs: [{ ...paragraph, runs: [{ ...run, text: '<script>alert(1)</script>' }] }],
      }).success,
    ).toBe(false);
    expect(
      textBodySchema.safeParse({ paragraphs: [{ ...paragraph, runs: [{ ...run, shapedGlyphs: [] }] }] }).success,
    ).toBe(false);
  });

  it('rejects unknown paragraph and run properties', () => {
    const body = createTextBody();
    const paragraph = textBodySchema.parse(body).paragraphs[0];
    const run = paragraph?.runs[0];

    expect(
      textBodySchema.safeParse({
        paragraphs: [{ ...paragraph, properties: { ...paragraph?.properties, css: 'text-align:center' } }],
      }).success,
    ).toBe(false);
    expect(
      textBodySchema.safeParse({
        paragraphs: [{ ...paragraph, runs: [{ ...run, properties: { ...run?.properties, html: '<b>x</b>' } }] }],
      }).success,
    ).toBe(false);
  });
});
