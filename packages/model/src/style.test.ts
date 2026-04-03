import { describe, expect, it } from '@jest/globals';

import { createDefaultStyle, isBorderRadiusUniform, normalizeBorderRadius, styleSchema } from './style';

/** @description Verifies the full BroadsetElementStyle shape with all required and optional fields */
describe('BroadsetElementStyle shape', () => {
  /** @description A style with only opacity (the sole required field) must pass validation */
  it('accepts a style with only opacity set', () => {
    const result = styleSchema.safeParse({ opacity: 1 });

    expect(result.success).toBe(true);
  });

  /** @description A fully populated style object must pass validation */
  it('accepts a fully populated style object', () => {
    const fullStyle = {
      opacity: 0.8,
      fontFamily: 'Arial',
      fontSize: 16,
      fontColor: '#333333',
      fontWeight: 'bold',
      fontStyle: 'italic',
      textAlignment: 'center',
      textDecoration: 'underline',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      lineHeight: '1.5',
      wordSpacing: '2px',
      textStroke: '1px black',
      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
      backgroundColor: '#ff0000',
      backgroundGradient: 'linear-gradient(to right, red, blue)',
      borderWidth: 2,
      borderColor: '#000000',
      borderRadius: [10, 20, 30, 40] as const,
      borderStyle: 'solid',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      filter: 'blur(5px)',
      backdropFilter: 'brightness(0.8)',
      mixBlendMode: 'multiply',
      isolation: 'isolate',
      padding: '10',
      objectFit: 'cover',
      stroke: '#000000',
      strokeWidth: 2,
      strokeDasharray: '5 3',
      strokeDashoffset: 0,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      strokeOpacity: 0.9,
      fill: '#ffffff',
      fillOpacity: 1,
      fillRule: 'evenodd' as const,
    };

    const result = styleSchema.safeParse(fullStyle);

    expect(result.success).toBe(true);
  });

  /** @description The factory must produce a valid default style with opacity 1 */
  it('creates default style with opacity 1', () => {
    const style = createDefaultStyle();

    expect(style.opacity).toBe(1);

    const result = styleSchema.safeParse(style);

    expect(result.success).toBe(true);
  });
});

/** @description Typography properties are all optional — only opacity is required */
describe('Typography properties', () => {
  /** @description Missing typography props must not cause validation failure */
  it('accepts style with no typography properties', () => {
    const result = styleSchema.safeParse({ opacity: 1 });

    expect(result.success).toBe(true);
  });

  /** @description All typography properties must be accepted when present */
  it('accepts style with all typography properties set', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      fontFamily: 'Helvetica',
      fontSize: 14,
      fontColor: 'rgb(0,0,0)',
      fontWeight: '700',
      fontStyle: 'normal',
      textAlignment: 'left',
      textDecoration: 'none',
      textTransform: 'capitalize',
      letterSpacing: '1px',
      lineHeight: 1.5,
      wordSpacing: 'normal',
    });

    expect(result.success).toBe(true);
  });
});

/** @description Text effects (textStroke, textShadow) are optional string values */
describe('Text effect properties', () => {
  /** @description textStroke must be accepted as an optional string */
  it('accepts textStroke value', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      textStroke: '1px black',
    });

    expect(result.success).toBe(true);
  });

  /** @description textShadow must be accepted as an optional string */
  it('accepts textShadow value', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
    });

    expect(result.success).toBe(true);
  });
});

/** @description Background properties support solid color and gradient, both optional */
describe('Background properties', () => {
  /** @description Solo backgroundColor must be accepted */
  it('accepts backgroundColor alone', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      backgroundColor: '#ff0000',
    });

    expect(result.success).toBe(true);
  });

  /** @description Both backgroundColor and backgroundGradient can coexist in the model */
  it('accepts both backgroundColor and backgroundGradient', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      backgroundColor: '#ff0000',
      backgroundGradient: 'linear-gradient(to right, red, blue)',
    });

    expect(result.success).toBe(true);
  });
});

/** @description Border properties: width, color, style are basic; radius supports uniform number or 4-tuple */
describe('Border properties', () => {
  /** @description A uniform number borderRadius must be accepted */
  it('accepts uniform borderRadius number', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      borderRadius: 10,
    });

    expect(result.success).toBe(true);
  });

  /** @description A per-corner 4-tuple borderRadius must be accepted */
  it('accepts per-corner borderRadius 4-tuple', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      borderRadius: [10, 20, 30, 40],
    });

    expect(result.success).toBe(true);
  });

  /** @description normalizeBorderRadius expands a single number to a uniform 4-tuple */
  it('normalizes uniform number to 4-tuple', () => {
    const result = normalizeBorderRadius(10);

    expect(result).toEqual([10, 10, 10, 10]);
  });

  /** @description normalizeBorderRadius preserves per-corner values in CSS shorthand order */
  it('preserves per-corner 4-tuple values', () => {
    const result = normalizeBorderRadius([10, 20, 30, 40]);

    expect(result).toEqual([10, 20, 30, 40]);
  });

  /** @description isBorderRadiusUniform returns true for equal corners */
  it('detects uniform border radius', () => {
    expect(isBorderRadiusUniform([10, 10, 10, 10])).toBe(true);
  });

  /** @description isBorderRadiusUniform returns false for unequal corners */
  it('detects non-uniform border radius', () => {
    expect(isBorderRadiusUniform([10, 20, 10, 10])).toBe(false);
  });
});

/** @description Visual effects: opacity is required (0-1), all others are optional strings */
describe('Visual effect properties', () => {
  /** @description Default opacity must be 1 */
  it('defaults opacity to 1', () => {
    const style = createDefaultStyle();

    expect(style.opacity).toBe(1);
  });

  /** @description Opacity outside 0-1 range must be rejected */
  it('rejects opacity greater than 1', () => {
    const result = styleSchema.safeParse({ opacity: 1.5 });

    expect(result.success).toBe(false);
  });

  /** @description Negative opacity must be rejected */
  it('rejects negative opacity', () => {
    const result = styleSchema.safeParse({ opacity: -0.1 });

    expect(result.success).toBe(false);
  });

  /** @description filter and backdropFilter must be accepted as optional strings */
  it('accepts filter and backdropFilter', () => {
    const result = styleSchema.safeParse({
      opacity: 0.5,
      filter: 'blur(5px)',
      backdropFilter: 'brightness(0.8)',
    });

    expect(result.success).toBe(true);
  });
});

/** @description SVG stroke/fill properties: constrained enum values for linecap, linejoin, fillRule */
describe('SVG stroke and fill properties', () => {
  /** @description All SVG stroke properties must be accepted when valid */
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

  /** @description All valid strokeLinecap values must be accepted */
  it.each(['butt', 'round', 'square'] as const)('accepts strokeLinecap "%s"', (value) => {
    const result = styleSchema.safeParse({
      opacity: 1,
      strokeLinecap: value,
    });

    expect(result.success).toBe(true);
  });

  /** @description All valid strokeLinejoin values must be accepted */
  it.each(['miter', 'round', 'bevel'] as const)('accepts strokeLinejoin "%s"', (value) => {
    const result = styleSchema.safeParse({
      opacity: 1,
      strokeLinejoin: value,
    });

    expect(result.success).toBe(true);
  });

  /** @description All valid fillRule values must be accepted */
  it.each(['nonzero', 'evenodd'] as const)('accepts fillRule "%s"', (value) => {
    const result = styleSchema.safeParse({
      opacity: 1,
      fillRule: value,
    });

    expect(result.success).toBe(true);
  });

  /** @description Invalid strokeLinecap values must be rejected */
  it('rejects invalid strokeLinecap', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      strokeLinecap: 'invalid',
    });

    expect(result.success).toBe(false);
  });

  /** @description Invalid fillRule values must be rejected */
  it('rejects invalid fillRule', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      fillRule: 'invalid',
    });

    expect(result.success).toBe(false);
  });
});

/** @description Padding must be non-negative — negative values are physically meaningless */
describe('Padding validation', () => {
  /** @description Positive numeric padding must be accepted */
  it('accepts positive numeric padding', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      padding: '10',
    });

    expect(result.success).toBe(true);
  });

  /** @description Zero padding must be accepted */
  it('accepts zero padding', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      padding: '0',
    });

    expect(result.success).toBe(true);
  });

  /** @description Negative padding must be rejected */
  it('rejects negative padding value', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      padding: '-5',
    });

    expect(result.success).toBe(false);
  });

  /** @description CSS shorthand with all non-negative values must be accepted */
  it('accepts CSS shorthand with non-negative values', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      padding: '10 20 10 20',
    });

    expect(result.success).toBe(true);
  });

  /** @description CSS shorthand containing a negative value must be rejected */
  it('rejects CSS shorthand with negative value', () => {
    const result = styleSchema.safeParse({
      opacity: 1,
      padding: '10 -5 10 20',
    });

    expect(result.success).toBe(false);
  });
});
