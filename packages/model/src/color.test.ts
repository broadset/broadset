import { describe, expect, it } from '@jest/globals';

import { normalizeColor } from './color';

/** @description All color inputs are normalized to 6- or 8-digit hex at the model boundary */
describe('Color normalization', () => {
  /** @description CSS named color "red" normalizes to #ff0000 */
  it('normalizes CSS named color to hex', () => {
    expect(normalizeColor('red')).toBe('#ff0000');
  });

  /** @description rgb(255, 128, 0) normalizes to #ff8000 */
  it('normalizes rgb() to hex', () => {
    expect(normalizeColor('rgb(255, 128, 0)')).toBe('#ff8000');
  });

  /** @description hsl(120, 100%, 50%) normalizes to #00ff00 */
  it('normalizes hsl() to hex', () => {
    expect(normalizeColor('hsl(120, 100%, 50%)')).toBe('#00ff00');
  });

  /** @description 3-digit hex #abc expands to #aabbcc */
  it('expands 3-digit hex to 6-digit', () => {
    expect(normalizeColor('#abc')).toBe('#aabbcc');
  });

  /** @description 4-digit hex #abcd expands to #aabbccdd */
  it('expands 4-digit hex to 8-digit', () => {
    expect(normalizeColor('#abcd')).toBe('#aabbccdd');
  });

  /** @description 6-digit hex is stored unchanged */
  it('keeps 6-digit hex unchanged', () => {
    expect(normalizeColor('#aabbcc')).toBe('#aabbcc');
  });

  /** @description 8-digit hex is stored unchanged */
  it('keeps 8-digit hex unchanged', () => {
    expect(normalizeColor('#aabbccdd')).toBe('#aabbccdd');
  });

  /** @description rgba(255, 128, 0, 0.5) normalizes to 8-digit hex */
  it('normalizes rgba() to 8-digit hex', () => {
    const result = normalizeColor('rgba(255, 128, 0, 0.5)');

    expect(result).toBe('#ff800080');
  });

  /** @description Unrecognized color strings must throw an error */
  it('throws on unrecognized color input', () => {
    expect(() => normalizeColor('rainbow')).toThrow('Unable to normalize color');
  });
});
