import { describe, expect, it } from 'vitest';

import { parseBoxShadow, parseFilterGlow, parseHexColor } from './';

describe('_shared/effects', () => {
  describe('parseHexColor', () => {
    it('parses #rgb shorthand', () => {
      expect(parseHexColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('parses #rrggbb', () => {
      expect(parseHexColor('#1A2B3C')).toEqual({ r: 26, g: 43, b: 60, a: 1 });
    });

    it('parses #rrggbbaa', () => {
      const c = parseHexColor('#00112280');

      expect(c?.r).toBe(0);
      expect(c?.g).toBe(17);
      expect(c?.b).toBe(34);
      expect(c?.a).toBeCloseTo(128 / 255, 4);
    });

    it('returns undefined for malformed input', () => {
      expect(parseHexColor('not-a-hex')).toBeUndefined();
      expect(parseHexColor('#abcde')).toBeUndefined();
    });
  });

  describe('parseBoxShadow', () => {
    it('parses CSS box-shadow with rgba colour', () => {
      expect(parseBoxShadow('2px 4px 8px rgba(0,0,0,0.5)')).toEqual({
        offsetX: 2,
        offsetY: 4,
        blur: 8,
        spread: 0,
        color: { r: 0, g: 0, b: 0, a: 0.5 },
        inset: false,
      });
    });

    it('parses CSS box-shadow with hex colour', () => {
      expect(parseBoxShadow('1px 2px 3px 4px #ff0000')).toEqual({
        offsetX: 1,
        offsetY: 2,
        blur: 3,
        spread: 4,
        color: { r: 255, g: 0, b: 0, a: 1 },
        inset: false,
      });
    });

    it('parses inset shadow', () => {
      const result = parseBoxShadow('inset 0px 0px 4px #000');

      expect(result?.inset).toBe(true);
    });

    it('returns undefined for malformed input', () => {
      expect(parseBoxShadow('not-a-shadow')).toBeUndefined();
    });
  });

  describe('parseFilterGlow', () => {
    it('parses CSS filter drop-shadow with zero offsets', () => {
      expect(parseFilterGlow('drop-shadow(0 0 6px rgba(255,255,0,0.8))')).toEqual({
        blur: 6,
        color: { r: 255, g: 255, b: 0, a: 0.8 },
      });
    });

    it('returns undefined for non-zero offsets (use parseBoxShadow instead)', () => {
      expect(parseFilterGlow('drop-shadow(2px 2px 4px black)')).toBeUndefined();
    });

    it('returns undefined for malformed input', () => {
      expect(parseFilterGlow('blur(4px)')).toBeUndefined();
    });
  });
});
