import { describe, expect, it } from 'vitest';

import { createDefaultStyle, isBorderRadiusUniform, normalizeBorderRadius, styleSchema } from './index';

/** @description The style schema must accept the full Broadset element style contract while enforcing numeric constraints. */
describe('BroadsetElementStyle shape', () => {
  /** @description A style with only the required `opacity` field must still validate. */
  it('accepts a style with only opacity set', () => {
    const result = styleSchema.safeParse({ opacity: 1 });

    expect(result.success).toBe(true);
  });

  /** @description A fully populated style object must validate so hosts can round-trip rich styling. */
  it('accepts a fully populated style object', () => {
    const fullStyle = {
      opacity: 0.8,
      fontFamily: 'Arial',
      fontSize: 16,
      fontColor: '#333333',
      fontWeight: 700,
      fontStyle: 'italic',
      textAlignment: 'center',
      textDecoration: 'underline',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      lineHeight: '1.5',
      wordSpacing: 2,
      textStroke: '1px black',
      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
      backgroundColor: '#ff0000',
      backgroundGradient: 'linear-gradient(to right, red, blue)',
      borderWidth: 2,
      borderColor: '#000000',
      borderRadius: [10, 20, 30, 40],
      borderStyle: 'solid',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      filter: 'blur(5px)',
      backdropFilter: 'brightness(0.8)',
      mixBlendMode: 'multiply',
      isolation: 'isolate',
      padding: [10, 10, 10, 10],
      objectFit: 'cover',
      stroke: '#000000',
      strokeWidth: 2,
      strokeDasharray: '5 3',
      strokeDashoffset: 0,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      strokeOpacity: 0.9,
      fill: '#ffffff',
      fillOpacity: 1,
      fillRule: 'evenodd',
    };
    const result = styleSchema.safeParse(fullStyle);

    expect(result.success).toBe(true);
  });

  /** @description The style factory must produce a valid default style with opacity 1. */
  it('creates default style with opacity 1', () => {
    const style = createDefaultStyle();
    const result = styleSchema.safeParse(style);

    expect(style.opacity).toBe(1);
    expect(result.success).toBe(true);
  });
});

/** @description Typography fields are optional and must validate when omitted or fully specified. */
describe('Typography properties', () => {
  /** @description Missing typography props must not cause validation failure. */
  it('accepts style with no typography properties', () => {
    const result = styleSchema.safeParse({ opacity: 1 });

    expect(result.success).toBe(true);
  });

  /** @description All typography-related props must be accepted when present in their typed forms. */
  it('accepts style with all typography properties set', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      fontFamily: 'Helvetica',
      fontSize: 14,
      fontColor: 'rgb(0,0,0)',
      fontWeight: 700,
      fontStyle: 'normal',
      textAlignment: 'left',
      textDecoration: 'none',
      textTransform: 'capitalize',
      letterSpacing: 1,
      lineHeight: 1.5,
      wordSpacing: 0,
    });

    expect(result.success).toBe(true);
  });

  /** @description String font-weight aliases must be rejected because the contract requires numeric weights. */
  it('rejects string fontWeight aliases', () => {
    expect(styleSchema.safeParse({ opacity: 1, fontWeight: 'bold' }).success).toBe(false);
  });
});

/** @description Text effects remain optional string fields for stroke and shadow rendering. */
describe('Text effect properties', () => {
  /** @description `textStroke` and `textShadow` must be accepted when present. */
  it('accepts textStroke and textShadow values', () => {
    expect(
      styleSchema.safeParse({
        opacity: 1,
        textStroke: '1px black',
      }).success,
    ).toBe(true);

    expect(
      styleSchema.safeParse({
        opacity: 1,
        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
      }).success,
    ).toBe(true);
  });
});

/** @description Background styling supports both flat colors and gradient definitions. */
describe('Background properties', () => {
  /** @description Either a solid background or a solid+gradient combination must validate. */
  it('accepts backgroundColor alone and with backgroundGradient', () => {
    expect(
      styleSchema.safeParse({
        opacity: 1,
        backgroundColor: '#ff0000',
      }).success,
    ).toBe(true);

    expect(
      styleSchema.safeParse({
        opacity: 1,
        backgroundColor: '#ff0000',
        backgroundGradient: 'linear-gradient(to right, red, blue)',
      }).success,
    ).toBe(true);
  });

  /**
   * @description Phase 1 unit #7 — conic gradients now accept a
   * `startAngle` (0-360°) for CSS `conic-gradient(from <angle>, …)`
   * support. Additive field; omitted values parse as undefined and
   * linear / radial gradients ignore the attribute.
   */
  it('accepts a conic gradient with startAngle', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      backgroundGradient: {
        type: 'conic',
        stops: [
          { color: '#ff0000', position: 0 },
          { color: '#0000ff', position: 100 },
        ],
        center: [50, 50],
        startAngle: 45,
      },
    });

    expect(result.success).toBe(true);
  });

  /**
   * @description `startAngle` is constrained to 0-360 inclusive. Out-
   * of-range values must fail validation so wrap-around is handled by
   * the renderer rather than silently accepted at the model boundary.
   */
  it('rejects startAngle outside 0..360', () => {
    const invalid = (startAngle: number): unknown => ({
      opacity: 1,
      backgroundGradient: {
        type: 'conic',
        stops: [
          { color: '#ff0000', position: 0 },
          { color: '#0000ff', position: 100 },
        ],
        startAngle,
      },
    });

    expect(styleSchema.safeParse(invalid(-1)).success).toBe(false);
    expect(styleSchema.safeParse(invalid(361)).success).toBe(false);
  });
});

/** @description Border helpers support uniform or per-corner radius values and expose normalization utilities. */
describe('Border properties', () => {
  /** @description Border radius accepts both a single numeric value and a four-corner tuple. */
  it('accepts uniform and per-corner borderRadius values', () => {
    expect(styleSchema.safeParse({ opacity: 1, borderRadius: 10 }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, borderRadius: [10, 20, 30, 40] }).success).toBe(true);
  });

  /** @description The border-radius helpers preserve CSS shorthand semantics. */
  it('normalizes and inspects border radius values', () => {
    expect(normalizeBorderRadius(10)).toEqual([10, 10, 10, 10]);
    expect(normalizeBorderRadius([10, 20, 30, 40])).toEqual([10, 20, 30, 40]);
    expect(isBorderRadiusUniform([10, 10, 10, 10])).toBe(true);
    expect(isBorderRadiusUniform([10, 20, 10, 10])).toBe(false);
  });
});

/** @description Opacity stays clamped to `[0, 1]` while visual effect strings remain optional. */
describe('Visual effect properties', () => {
  /** @description Default opacity is 1 and out-of-range opacity values must be rejected. */
  it('validates opacity bounds', () => {
    const style = createDefaultStyle();

    expect(style.opacity).toBe(1);
    expect(styleSchema.safeParse({ opacity: 1.5 }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: -0.1 }).success).toBe(false);
  });

  /** @description `filter` and `backdropFilter` must be accepted as optional effect strings. */
  it('accepts filter and backdropFilter', () => {
    const result = styleSchema.safeParse({
      opacity: 0.5,
      filter: 'blur(5px)',
      backdropFilter: 'brightness(0.8)',
    });

    expect(result.success).toBe(true);
  });
});

/** @description SVG stroke/fill fields accept only the documented enum values. */
describe('SVG stroke and fill properties', () => {
  /** @description A full, valid stroke config must validate cleanly. */
  it('accepts valid stroke properties', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      stroke: '#000000',
      strokeWidth: 2,
      strokeDasharray: '5 3',
      strokeDashoffset: 0,
      strokeLinecap: 'round',
      strokeLinejoin: 'bevel',
      strokeOpacity: 0.9,
    });

    expect(result.success).toBe(true);
  });

  /** @description Valid linecap, linejoin, and fill-rule enum members must all be accepted. */
  it.each([
    ['strokeLinecap', 'butt'],
    ['strokeLinecap', 'round'],
    ['strokeLinecap', 'square'],
    ['strokeLinejoin', 'miter'],
    ['strokeLinejoin', 'round'],
    ['strokeLinejoin', 'bevel'],
    ['fillRule', 'nonzero'],
    ['fillRule', 'evenodd'],
  ])('accepts %s=%s', (key, value) => {
    const result = styleSchema.safeParse({
      opacity: 1,
      [key]: value,
    });

    expect(result.success).toBe(true);
  });

  /** @description Unsupported enum members must be rejected. */
  it('rejects invalid strokeLinecap and fillRule values', () => {
    expect(styleSchema.safeParse({ opacity: 1, strokeLinecap: 'invalid' }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, fillRule: 'invalid' }).success).toBe(false);
  });
});

/**
 * @description Stroke miter limit and arrow endings round-trip into PPTX connectors,
 * PDF line terminators, SVG `marker-start`/`marker-end`, and PSD shape layers.
 * The model must validate the SVG-compatible floor (miterlimit >= 1) and the
 * discrete `ArrowEnd` vocabulary so every importer/exporter speaks the same
 * shapes and sizes.
 */
describe('Stroke enhancements', () => {
  /** @description The SVG default of 4 must validate cleanly. */
  it('accepts strokeMiterlimit at the SVG default value', () => {
    const result = styleSchema.safeParse({ opacity: 1, strokeMiterlimit: 4 });

    expect(result.success).toBe(true);
  });

  /** @description Larger finite miter limits must validate so steep-angle joins remain sharp. */
  it('accepts strokeMiterlimit values above 1', () => {
    expect(styleSchema.safeParse({ opacity: 1, strokeMiterlimit: 1 }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, strokeMiterlimit: 10 }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, strokeMiterlimit: 100 }).success).toBe(true);
  });

  /** @description Values below 1 (and 0) must be rejected — SVG spec forbids them. */
  it('rejects strokeMiterlimit below 1', () => {
    expect(styleSchema.safeParse({ opacity: 1, strokeMiterlimit: 0 }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, strokeMiterlimit: 0.5 }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, strokeMiterlimit: -4 }).success).toBe(false);
  });

  /** @description Every ArrowEnd shape keyword must validate for both head and tail. */
  it.each([
    ['strokeHeadEnd', 'triangle'],
    ['strokeHeadEnd', 'stealth'],
    ['strokeHeadEnd', 'diamond'],
    ['strokeHeadEnd', 'oval'],
    ['strokeHeadEnd', 'none'],
    ['strokeTailEnd', 'triangle'],
    ['strokeTailEnd', 'stealth'],
    ['strokeTailEnd', 'diamond'],
    ['strokeTailEnd', 'oval'],
    ['strokeTailEnd', 'none'],
  ])('accepts %s with shape %s', (key, shape) => {
    const result = styleSchema.safeParse({
      opacity: 1,
      [key]: { shape },
    });

    expect(result.success).toBe(true);
  });

  /** @description Size keywords must validate on width and length for both ends. */
  it('accepts ArrowEnd width and length size keywords', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      strokeHeadEnd: { shape: 'triangle', width: 'md', length: 'lg' },
      strokeTailEnd: { shape: 'diamond', width: 'sm', length: 'sm' },
    });

    expect(result.success).toBe(true);
  });

  /** @description Unknown ArrowEnd shapes must be rejected. */
  it('rejects unknown ArrowEnd shapes', () => {
    expect(
      styleSchema.safeParse({ opacity: 1, strokeHeadEnd: { shape: 'arrow' } }).success,
    ).toBe(false);
    expect(
      styleSchema.safeParse({ opacity: 1, strokeTailEnd: { shape: '' } }).success,
    ).toBe(false);
  });

  /** @description Unknown ArrowEnd size keywords must be rejected. */
  it('rejects unknown ArrowEnd size keywords', () => {
    expect(
      styleSchema.safeParse({
        opacity: 1,
        strokeHeadEnd: { shape: 'triangle', width: 'xl' },
      }).success,
    ).toBe(false);
    expect(
      styleSchema.safeParse({
        opacity: 1,
        strokeTailEnd: { shape: 'triangle', length: 'huge' },
      }).success,
    ).toBe(false);
  });

  /** @description Missing the required `shape` field must be rejected. */
  it('rejects ArrowEnd objects without a shape', () => {
    expect(
      styleSchema.safeParse({ opacity: 1, strokeHeadEnd: { width: 'md' } }).success,
    ).toBe(false);
  });

  /** @description The parsed value must preserve the provided shape and sizes verbatim. */
  it('preserves the ArrowEnd object on parse', () => {
    const parsed = styleSchema.parse({
      opacity: 1,
      strokeMiterlimit: 8,
      strokeHeadEnd: { shape: 'stealth', width: 'lg', length: 'md' },
      strokeTailEnd: { shape: 'none' },
    });

    expect(parsed.strokeMiterlimit).toBe(8);
    expect(parsed.strokeHeadEnd).toEqual({ shape: 'stealth', width: 'lg', length: 'md' });
    expect(parsed.strokeTailEnd).toEqual({ shape: 'none' });
  });
});

/** @description Padding values must stay non-negative and use the required four-number tuple format. */
describe('Padding validation', () => {
  /** @description Four-value non-negative padding tuples must be accepted. */
  it('accepts valid padding tuples', () => {
    expect(styleSchema.safeParse({ opacity: 1, padding: [10, 10, 10, 10] }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, padding: [0, 0, 0, 0] }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, padding: [8, 16, 8, 16] }).success).toBe(true);
  });

  /** @description Negative values and non-tuple padding input must be rejected. */
  it('rejects invalid padding values', () => {
    expect(styleSchema.safeParse({ opacity: 1, padding: [10, -5, 10, 20] }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, padding: '10 20 10 20' }).success).toBe(false);
  });
});

/** @description Numeric fields distinguish between positive-only and non-negative constraints. */
describe('Numeric field constraints', () => {
  /** @description `fontSize` must be strictly positive. */
  it('enforces positive fontSize values', () => {
    expect(styleSchema.safeParse({ opacity: 1, fontSize: -10 }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, fontSize: 0 }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, fontSize: 16 }).success).toBe(true);
  });

  /** @description `borderWidth` and `strokeWidth` must stay non-negative. */
  it('enforces non-negative borderWidth and strokeWidth values', () => {
    expect(styleSchema.safeParse({ opacity: 1, borderWidth: -5 }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, borderWidth: 0 }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, strokeWidth: -2 }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, strokeWidth: 0 }).success).toBe(true);
  });
});

describe('Masking and clipping properties', () => {
  /** @description maskType must accept all valid union values. */
  it('accepts valid maskType values', () => {
    for (const value of ['none', 'alpha', 'luminance', 'custom'] as const) {
      expect(styleSchema.safeParse({ opacity: 1, maskType: value }).success).toBe(true);
    }
  });

  /** @description customClipPath must accept valid SVG path data (starting with M/m). */
  it('accepts SVG path data for customClipPath', () => {
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: 'M 0 0 L 100 0 L 100 100 Z' }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: 'm 0 0 l 100 0 l 0 100 z' }).success).toBe(true);
  });

  /** @description customClipPath must accept CSS clip-path functions (polygon, circle, ellipse, inset, path). */
  it('accepts CSS clip-path functions for customClipPath', () => {
    expect(
      styleSchema.safeParse({ opacity: 1, customClipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }).success,
    ).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: 'circle(50%)' }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: 'ellipse(40% 60%)' }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: 'inset(10%)' }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: 'path("M 0 0 L 100 100")' }).success).toBe(true);
  });

  /** @description customClipPath must reject invalid values that are not SVG paths or CSS clip-path functions. */
  it('rejects invalid customClipPath values', () => {
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: 'not a path' }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: 'L 0 0 L 100 0' }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: 'rect(0, 0, 100, 100)' }).success).toBe(false);
  });

  /** @description Empty customClipPath must be accepted (default state). */
  it('accepts empty customClipPath', () => {
    expect(styleSchema.safeParse({ opacity: 1, customClipPath: '' }).success).toBe(true);
  });
});

/**
 * Phase 1 unit #11 — adds the remaining SVG-originating text-fidelity
 * fields that PDF, PPTX, and PSD importers need somewhere to round-trip
 * their text layout. `textAnchor`, `textLength`, and `lengthAdjust`
 * join the already-present `wordSpacing`, `textTransform`, and
 * `lineHeight` so every SVG text attribute worth preserving has a
 * first-class home on `BroadsetElementStyle`.
 */
describe('Text fidelity properties (unit #11)', () => {
  /**
   * @description Every `textAnchor` value in the SVG spec must validate.
   * `start`/`middle`/`end` map directly to SVG `text-anchor`, and round-
   * trip through PDF's text-show operators and PPTX's
   * `<a:pPr algn="…">` so the preserved value is identical on the
   * way back out of an importer.
   */
  it.each(['start', 'middle', 'end'] as const)('accepts textAnchor value %s', (value) => {
    const result = styleSchema.safeParse({ opacity: 1, textAnchor: value });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.textAnchor).toBe(value);
    }
  });

  /**
   * @description Arbitrary strings must be rejected. The SVG spec
   * names the three values exhaustively — accepting anything else
   * silently corrupts importer output and turns a validation bug into
   * a rendering bug.
   */
  it('rejects unknown textAnchor values', () => {
    expect(styleSchema.safeParse({ opacity: 1, textAnchor: 'center' }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, textAnchor: '' }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, textAnchor: 0 }).success).toBe(false);
  });

  /**
   * @description `textLength` is the SVG attribute that pins a piece
   * of text to a specific advance length (in document units). It must
   * be non-negative — negative lengths are malformed per the SVG
   * spec — and finite.
   */
  it('accepts non-negative textLength values', () => {
    expect(styleSchema.safeParse({ opacity: 1, textLength: 0 }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, textLength: 120 }).success).toBe(true);
    expect(styleSchema.safeParse({ opacity: 1, textLength: 0.5 }).success).toBe(true);
  });

  /**
   * @description Negative, NaN, or infinite textLength must be
   * rejected — the SVG spec forbids negative advance, and `NaN` /
   * `Infinity` would poison any renderer that reads the attribute.
   */
  it('rejects negative or non-finite textLength values', () => {
    expect(styleSchema.safeParse({ opacity: 1, textLength: -1 }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, textLength: Number.NaN }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, textLength: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  /**
   * @description `lengthAdjust` controls how SVG distributes the
   * advance between glyph spacing and glyph stretching. The two
   * values `spacing` (default) and `spacingAndGlyphs` are the entire
   * SVG vocabulary — nothing else is valid.
   */
  it.each(['spacing', 'spacingAndGlyphs'] as const)('accepts lengthAdjust value %s', (value) => {
    const result = styleSchema.safeParse({ opacity: 1, lengthAdjust: value });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.lengthAdjust).toBe(value);
    }
  });

  /**
   * @description Unknown `lengthAdjust` strings must be rejected.
   * Accepting arbitrary values would let the attribute round-trip as
   * an unknown literal and surface as a renderer failure later.
   */
  it('rejects unknown lengthAdjust values', () => {
    expect(styleSchema.safeParse({ opacity: 1, lengthAdjust: 'spacingOnly' }).success).toBe(false);
    expect(styleSchema.safeParse({ opacity: 1, lengthAdjust: '' }).success).toBe(false);
  });

  /**
   * @description When none of the unit #11 fields are provided the
   * parsed style must omit them (undefined) so callers can tell "user
   * did not set a value" from "user explicitly chose start / zero /
   * spacing", which matters for preflight warnings and exporter
   * decisions about whether to emit the SVG attribute at all.
   */
  it('omits unit #11 fields when not provided', () => {
    const result = styleSchema.safeParse({ opacity: 1 });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.textAnchor).toBeUndefined();
      expect(result.data.textLength).toBeUndefined();
      expect(result.data.lengthAdjust).toBeUndefined();
    }
  });
});

/** @description fontVariationSettings stores a CSS font-variation-settings string on the element style. */
describe('fontVariationSettings', () => {
  /** @description A valid axis tag and numeric value string is accepted. */
  it('accepts valid font-variation-settings string', () => {
    const result = styleSchema.safeParse({ opacity: 1, fontVariationSettings: "'wght' 450, 'wdth' 80" });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.fontVariationSettings).toBe("'wght' 450, 'wdth' 80");
    }
  });

  /** @description When omitted, fontVariationSettings is undefined in the parsed style. */
  it('omits fontVariationSettings when not provided', () => {
    const result = styleSchema.safeParse({ opacity: 1 });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.fontVariationSettings).toBeUndefined();
    }
  });
});
