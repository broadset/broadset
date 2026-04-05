import { describe, expect, it } from '@jest/globals';

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
