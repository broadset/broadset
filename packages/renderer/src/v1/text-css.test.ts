import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { paragraphToStyle, runToStyle, runToStyleV1 } from './text-css';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const FONT_FAMILY_ID = id('font-family');
const FONT_FACE_ID = id('font-face');
const SWATCH_ID = id('swatch');
const NO_FONTS: ReadonlyMap<projectFormatV1.Id, projectFormatV1.FontFamilyResource> = new Map();
const NO_SWATCHES: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = new Map();
const SWATCHES: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = new Map([
  [SWATCH_ID, { id: SWATCH_ID, kind: 'process', name: 'Swatch', color: srgb(0.25, 0.5, 0.75), producerAliases: [] }],
]);

function srgb(red: number, green: number, blue: number, alpha = 1): projectFormatV1.ConcreteColorValue {
  return { kind: 'color', space: 'srgb', channels: [red, green, blue], alpha };
}

function run(overrides: Partial<projectFormatV1.RunProperties> = {}): projectFormatV1.RunProperties {
  return {
    fontFamilyId: FONT_FAMILY_ID,
    fontFaceId: FONT_FACE_ID,
    size: 16,
    color: srgb(0, 0, 0),
    weight: 400,
    variationAxes: [],
    openTypeFeatures: [],
    language: 'en',
    script: 'Latn',
    direction: 'auto',
    decoration: { underline: false, strikeThrough: false, style: 'solid' },
    baselineShift: 0,
    tracking: 0,
    semanticRole: 'none',
    ...overrides,
  };
}

function paragraph(overrides: Partial<projectFormatV1.ParagraphProperties> = {}): projectFormatV1.ParagraphProperties {
  return {
    alignment: 'start',
    direction: 'auto',
    lineSpacing: { kind: 'normal' },
    spaceBefore: 0,
    spaceAfter: 0,
    firstLineIndent: 0,
    startIndent: 0,
    endIndent: 0,
    tabs: [],
    list: { kind: 'none' },
    hyphenation: 'none',
    keepTogether: false,
    keepWithNext: false,
    widowControl: false,
    ...overrides,
  };
}

describe('runToStyle', () => {
  it('converts run size, tracking, and baseline shift from physical units', () => {
    const style = runToStyleV1({
      run: run({ size: 2.54, tracking: 0.254, baselineShift: -0.127 }),
      fonts: NO_FONTS,
      swatches: NO_SWATCHES,
      units: { unit: 'mm', dpi: 254 },
    });

    expect(style.fontSize).toBe('25.4px');
    expect(style.letterSpacing).toBe('2.54px');
    expect(style.verticalAlign).toBe('-1.27px');
  });

  it('maps size to fontSize in pixels', () => {
    expect(runToStyle(run({ size: 12.5 }), NO_FONTS, NO_SWATCHES).fontSize).toBe('12.5px');
  });

  it('maps color through the v1 color CSS resolver', () => {
    expect(runToStyle(run({ color: srgb(1, 0.5, 0) }), NO_FONTS, NO_SWATCHES).color).toBe('color(srgb 1 0.5 0)');
  });

  it('resolves a swatch-backed run color from a map keyed by a parsed v1 id', () => {
    const style = runToStyle(run({ color: { kind: 'swatch', swatchId: SWATCH_ID } }), NO_FONTS, SWATCHES);

    expect(style.color).toBe('color(srgb 0.25 0.5 0.75)');
  });

  it('maps weight to fontWeight', () => {
    expect(runToStyle(run({ weight: 700 }), NO_FONTS, NO_SWATCHES).fontWeight).toBe('700');
  });

  it('maps nonzero tracking to letterSpacing in pixels', () => {
    expect(runToStyle(run({ tracking: 1.25 }), NO_FONTS, NO_SWATCHES).letterSpacing).toBe('1.25px');
  });

  it('omits letterSpacing for zero tracking', () => {
    expect(runToStyle(run(), NO_FONTS, NO_SWATCHES)).not.toHaveProperty('letterSpacing');
  });

  it('maps underline and strike-through to an ordered textDecorationLine', () => {
    const style = runToStyle(
      run({ decoration: { underline: true, strikeThrough: true, style: 'dashed' } }),
      NO_FONTS,
      NO_SWATCHES,
    );

    expect(style.textDecorationLine).toBe('underline line-through');
  });

  it('maps decoration style when a decoration line is present', () => {
    const style = runToStyle(
      run({ decoration: { underline: true, strikeThrough: false, style: 'wavy' } }),
      NO_FONTS,
      NO_SWATCHES,
    );

    expect(style.textDecorationStyle).toBe('wavy');
  });

  it('omits decoration line and style when neither line is enabled', () => {
    const style = runToStyle(run(), NO_FONTS, NO_SWATCHES);

    expect(style).not.toHaveProperty('textDecorationLine');
    expect(style).not.toHaveProperty('textDecorationStyle');
  });

  it('maps decoration color through the v1 color CSS resolver', () => {
    const style = runToStyle(
      run({ decoration: { underline: true, strikeThrough: false, style: 'solid', color: srgb(0, 0, 1) } }),
      NO_FONTS,
      NO_SWATCHES,
    );

    expect(style.textDecorationColor).toBe('color(srgb 0 0 1)');
  });

  it('omits textDecorationColor when decoration color is absent', () => {
    expect(runToStyle(run(), NO_FONTS, NO_SWATCHES)).not.toHaveProperty('textDecorationColor');
  });

  it('maps rtl direction', () => {
    expect(runToStyle(run({ direction: 'rtl' }), NO_FONTS, NO_SWATCHES).direction).toBe('rtl');
  });

  it('omits auto direction', () => {
    expect(runToStyle(run(), NO_FONTS, NO_SWATCHES)).not.toHaveProperty('direction');
  });

  it('maps variation axes to fontVariationSettings', () => {
    const style = runToStyle(
      run({
        variationAxes: [
          { tag: 'wght', value: 600 },
          { tag: 'wdth', value: 100 },
        ],
      }),
      NO_FONTS,
      NO_SWATCHES,
    );

    expect(style.fontVariationSettings).toBe('"wght" 600, "wdth" 100');
  });

  it('omits fontVariationSettings for no variation axes', () => {
    expect(runToStyle(run(), NO_FONTS, NO_SWATCHES)).not.toHaveProperty('fontVariationSettings');
  });

  it('maps OpenType features to fontFeatureSettings', () => {
    const style = runToStyle(
      run({
        openTypeFeatures: [
          { tag: 'liga', value: 1 },
          { tag: 'kern', value: 0 },
        ],
      }),
      NO_FONTS,
      NO_SWATCHES,
    );

    expect(style.fontFeatureSettings).toBe('"liga" 1, "kern" 0');
  });

  it('omits fontFeatureSettings for no OpenType features', () => {
    expect(runToStyle(run(), NO_FONTS, NO_SWATCHES)).not.toHaveProperty('fontFeatureSettings');
  });

  it('maps subscript semantic role to sub vertical alignment', () => {
    expect(runToStyle(run({ semanticRole: 'subscript' }), NO_FONTS, NO_SWATCHES).verticalAlign).toBe('sub');
  });

  it('maps superscript semantic role to super vertical alignment', () => {
    expect(runToStyle(run({ semanticRole: 'superscript' }), NO_FONTS, NO_SWATCHES).verticalAlign).toBe('super');
  });

  it('maps a nonzero baseline shift to verticalAlign in pixels', () => {
    expect(runToStyle(run({ baselineShift: -2.5 }), NO_FONTS, NO_SWATCHES).verticalAlign).toBe('-2.5px');
  });

  it('omits verticalAlign for a zero baseline shift and non-script role', () => {
    expect(runToStyle(run(), NO_FONTS, NO_SWATCHES)).not.toHaveProperty('verticalAlign');
  });

  it('resolves a font family from the font resource map', () => {
    const fonts = new Map<projectFormatV1.Id, projectFormatV1.FontFamilyResource>([
      [FONT_FAMILY_ID, { id: FONT_FAMILY_ID, familyName: 'Inter', fallbackFontIds: [], faces: [] }],
    ]);

    expect(runToStyle(run(), fonts, NO_SWATCHES).fontFamily).toBe('Inter');
  });

  it('quotes a resolved font family containing whitespace', () => {
    const fonts = new Map<projectFormatV1.Id, projectFormatV1.FontFamilyResource>([
      [FONT_FAMILY_ID, { id: FONT_FAMILY_ID, familyName: 'Open Sans', fallbackFontIds: [], faces: [] }],
    ]);

    expect(runToStyle(run(), fonts, NO_SWATCHES).fontFamily).toBe('"Open Sans"');
  });

  it('escapes quotes and backslashes in a quoted font family', () => {
    const fonts = new Map<projectFormatV1.Id, projectFormatV1.FontFamilyResource>([
      [FONT_FAMILY_ID, { id: FONT_FAMILY_ID, familyName: 'Open "Display" \\ Pro', fallbackFontIds: [], faces: [] }],
    ]);

    expect(runToStyle(run(), fonts, NO_SWATCHES).fontFamily).toBe('"Open \\"Display\\" \\\\ Pro"');
  });

  it('quotes a font family containing a CSS string special character', () => {
    const fonts = new Map<projectFormatV1.Id, projectFormatV1.FontFamilyResource>([
      [FONT_FAMILY_ID, { id: FONT_FAMILY_ID, familyName: 'Display"Pro', fallbackFontIds: [], faces: [] }],
    ]);

    expect(runToStyle(run(), fonts, NO_SWATCHES).fontFamily).toBe('"Display\\"Pro"');
  });

  it('omits fontFamily when the resource id is unresolved', () => {
    expect(runToStyle(run(), NO_FONTS, NO_SWATCHES)).not.toHaveProperty('fontFamily');
  });
});

describe('paragraphToStyle', () => {
  it('maps absolute line spacing and paragraph distances through physical units', () => {
    const style = paragraphToStyle(
      paragraph({ lineSpacing: { kind: 'absolute', value: 2.54 }, spaceBefore: 1.27, startIndent: 0.254 }),
      { unit: 'mm', dpi: 254 },
    );

    expect(style.lineHeight).toBe('25.4px');
    expect(style.marginTop).toBe('12.7px');
    expect(style.paddingInlineStart).toBe('2.54px');
  });

  it('maps start alignment', () => {
    expect(paragraphToStyle(paragraph({ alignment: 'start' })).textAlign).toBe('start');
  });

  it('maps center alignment', () => {
    expect(paragraphToStyle(paragraph({ alignment: 'center' })).textAlign).toBe('center');
  });

  it('maps end alignment', () => {
    expect(paragraphToStyle(paragraph({ alignment: 'end' })).textAlign).toBe('end');
  });

  it('maps justify alignment', () => {
    expect(paragraphToStyle(paragraph({ alignment: 'justify' })).textAlign).toBe('justify');
  });

  it('maps rtl direction', () => {
    expect(paragraphToStyle(paragraph({ direction: 'rtl' })).direction).toBe('rtl');
  });

  it('omits auto direction', () => {
    expect(paragraphToStyle(paragraph())).not.toHaveProperty('direction');
  });

  it('maps multiple line spacing to a unitless lineHeight', () => {
    expect(paragraphToStyle(paragraph({ lineSpacing: { kind: 'multiple', value: 1.25 } })).lineHeight).toBe('1.25');
  });

  it('omits lineHeight for normal line spacing', () => {
    expect(paragraphToStyle(paragraph())).not.toHaveProperty('lineHeight');
  });

  it('maps nonzero spaceBefore to marginTop in pixels', () => {
    expect(paragraphToStyle(paragraph({ spaceBefore: 8 })).marginTop).toBe('8px');
  });

  it('maps nonzero spaceAfter to marginBottom in pixels', () => {
    expect(paragraphToStyle(paragraph({ spaceAfter: 12 })).marginBottom).toBe('12px');
  });

  it('maps nonzero firstLineIndent to textIndent in pixels', () => {
    expect(paragraphToStyle(paragraph({ firstLineIndent: -4 })).textIndent).toBe('-4px');
  });

  it('maps nonzero startIndent to paddingInlineStart in pixels', () => {
    expect(paragraphToStyle(paragraph({ startIndent: 10 })).paddingInlineStart).toBe('10px');
  });

  it('maps nonzero endIndent to paddingInlineEnd in pixels', () => {
    expect(paragraphToStyle(paragraph({ endIndent: 14 })).paddingInlineEnd).toBe('14px');
  });

  it('omits zero margins and indents', () => {
    const style = paragraphToStyle(paragraph());

    expect(style).not.toHaveProperty('marginTop');
    expect(style).not.toHaveProperty('marginBottom');
    expect(style).not.toHaveProperty('textIndent');
    expect(style).not.toHaveProperty('paddingInlineStart');
    expect(style).not.toHaveProperty('paddingInlineEnd');
  });

  it('maps manual hyphenation', () => {
    expect(paragraphToStyle(paragraph({ hyphenation: 'manual' })).hyphens).toBe('manual');
  });

  it('maps auto hyphenation', () => {
    expect(paragraphToStyle(paragraph({ hyphenation: 'auto' })).hyphens).toBe('auto');
  });

  it('omits none hyphenation', () => {
    expect(paragraphToStyle(paragraph())).not.toHaveProperty('hyphens');
  });
});
