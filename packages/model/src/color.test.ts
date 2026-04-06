import { describe, expect, it } from '@jest/globals';

import { normalizeColor } from './color';

/** @description All color inputs are normalized to 6- or 8-digit hex at the model boundary. */
describe('Color normalization', () => {
  /** @description CSS named color `red` normalizes to `#ff0000`. */
  it('normalizes CSS named colors to hex', () => {
    expect(normalizeColor('red')).toBe('#ff0000');
  });

  /** @description `rgb(255, 128, 0)` normalizes to `#ff8000`. */
  it('normalizes rgb() to hex', () => {
    expect(normalizeColor('rgb(255, 128, 0)')).toBe('#ff8000');
  });

  /** @description `hsl(120, 100%, 50%)` normalizes to `#00ff00`. */
  it('normalizes hsl() to hex', () => {
    expect(normalizeColor('hsl(120, 100%, 50%)')).toBe('#00ff00');
  });

  /** @description Three-digit hex expands to six digits. */
  it('expands 3-digit hex to 6-digit', () => {
    expect(normalizeColor('#abc')).toBe('#aabbcc');
  });

  /** @description Four-digit hex expands to eight digits including alpha. */
  it('expands 4-digit hex to 8-digit', () => {
    expect(normalizeColor('#abcd')).toBe('#aabbccdd');
  });

  /** @description Fully specified hex values are preserved verbatim. */
  it('keeps 6-digit and 8-digit hex unchanged', () => {
    expect(normalizeColor('#aabbcc')).toBe('#aabbcc');
    expect(normalizeColor('#aabbccdd')).toBe('#aabbccdd');
  });

  /** @description RGBA values normalize to eight-digit hex including alpha. */
  it('normalizes rgba() to 8-digit hex', () => {
    const result = normalizeColor('rgba(255, 128, 0, 0.5)');

    expect(result).toBe('#ff800080');
  });

  /** @description Impossible alpha values must be rejected rather than silently clamped. */
  it('throws on out-of-range rgba/hsla alpha values', () => {
    expect(() => normalizeColor('rgba(255, 128, 0, 1.5)')).toThrow('Unable to normalize color');
    expect(() => normalizeColor('rgba(255, 128, 0, -0.2)')).toThrow('Unable to normalize color');
    expect(() => normalizeColor('hsla(120, 100%, 50%, 2)')).toThrow('Unable to normalize color');
  });

  /** @description Unrecognized color strings must fail loudly instead of silently passing through. */
  it('throws on unrecognized color input', () => {
    expect(() => normalizeColor('rainbow')).toThrow('Unable to normalize color');
  });
});
