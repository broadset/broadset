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

  it.each([
    ['normal line spacing', { lineSpacing: { kind: 'normal' } }],
    ['unordered list', { list: { kind: 'unordered', level: 2, marker: 'square' } }],
  ])('accepts and preserves %s', (_case, propertyOverride) => {
    const body = textBodySchema.parse(createTextBody());
    const paragraph = body.paragraphs[0];
    const value = {
      paragraphs: [{ ...paragraph, properties: { ...paragraph?.properties, ...propertyOverride } }],
    };

    expect(textBodySchema.parse(value)).toEqual(value);
  });

  it('defers duplicate paragraph and run ids', () => {
    const body = createTextBody();
    const paragraph = textBodySchema.parse(body).paragraphs[0];

    expect(paragraph).toBeDefined();
    expect(textBodySchema.safeParse({ paragraphs: [paragraph, paragraph] }).success).toBe(true);
    expect(
      textBodySchema.safeParse({ paragraphs: [{ ...paragraph, runs: [paragraph?.runs[0], paragraph?.runs[0]] }] })
        .success,
    ).toBe(true);
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

  it.each([
    ['unknown spacing kind', { lineSpacing: { kind: 'relative', value: 1.2 } }],
    ['normal spacing payload', { lineSpacing: { kind: 'normal', value: 1 } }],
    ['multiple spacing missing value', { lineSpacing: { kind: 'multiple' } }],
    ['absolute spacing at zero', { lineSpacing: { kind: 'absolute', value: 0 } }],
    ['unknown list kind', { list: { kind: 'bullets', level: 0 } }],
    ['none list payload', { list: { kind: 'none', level: 0 } }],
    ['unordered list missing marker', { list: { kind: 'unordered', level: 0 } }],
    ['ordered list missing start', { list: { kind: 'ordered', level: 0, style: 'decimal' } }],
    ['unknown paragraph direction', { direction: 'vertical' }],
  ])('rejects malformed paragraph %s', (_case, propertyOverride) => {
    const body = textBodySchema.parse(createTextBody());
    const paragraph = body.paragraphs[0];

    expect(
      textBodySchema.safeParse({
        paragraphs: [{ ...paragraph, properties: { ...paragraph?.properties, ...propertyOverride } }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ['unknown run direction', { direction: 'vertical' }],
    ['unknown semantic role', { semanticRole: 'heading' }],
    ['unknown decoration style', { decoration: { underline: true, strikeThrough: false, style: 'blink' } }],
  ])('rejects malformed run property discriminant for %s', (_case, propertyOverride) => {
    const body = textBodySchema.parse(createTextBody());
    const paragraph = body.paragraphs[0];
    const run = paragraph?.runs[0];

    expect(
      textBodySchema.safeParse({
        paragraphs: [
          {
            ...paragraph,
            runs: [{ ...run, properties: { ...run?.properties, ...propertyOverride } }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
