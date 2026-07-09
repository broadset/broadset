import type { BroadsetColor } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { applyMods, gamutMap, toRgb } from './color-ops';

/**
 * Phase 2 `_shared/color/` — tests pin the culori-backed operations
 * every format exporter depends on: sRGB projection for non-sRGB
 * inputs, gamut mapping for display-p3 → sRGB fallback, and the
 * PowerPoint-style color-mod arithmetic that drives theme-aware
 * accents and gradient stops.
 */

function rgb(hex: `#${string}`, overrides: Partial<BroadsetColor> = {}): BroadsetColor {
  return { kind: 'rgb', hex, ...overrides } as BroadsetColor;
}

describe('toRgb', () => {
  /**
   * @description An sRGB hex projects to the expected 0-1 triple.
   */
  it('converts an sRGB hex to the expected rgb channels', () => {
    const result = toRgb(rgb('#ff0000'));

    expect(result.r).toBeCloseTo(1, 3);
    expect(result.g).toBeCloseTo(0, 3);
    expect(result.b).toBeCloseTo(0, 3);
  });

  /**
   * @description An RGBA hex surfaces the alpha channel.
   */
  it('preserves alpha for an RGBA hex', () => {
    const result = toRgb(rgb('#00ff007f'));

    expect(result.alpha).toBeCloseTo(0x7f / 0xff, 2);
  });

  /**
   * @description A non-sRGB originalColor (oklch / display-p3) uses
   * the preserved source string so the conversion honors the source
   * color space per IO-D-05.
   */
  it('uses the preserved originalColor for non-sRGB inputs', () => {
    const color: BroadsetColor = {
      kind: 'rgb',
      hex: '#ff0000',
      space: 'display-p3',
      originalColor: 'color(display-p3 1 0 0)',
    };
    const result = toRgb(color);
    // display-p3 primary red falls outside the sRGB gamut — culori emits
    // out-of-range channels (r slightly >1, g slightly <0) rather than
    // silently clamping. The key assertion is that the preserved
    // originalColor produced a different result from the hex fallback.
    const fallbackResult = toRgb({ kind: 'rgb', hex: '#ff0000' });
    const channelDelta = Math.abs(result.r - fallbackResult.r) + Math.abs(result.g - fallbackResult.g);

    expect(channelDelta).toBeGreaterThan(0.1);
  });

  /**
   * @description Theme colors must be resolved before calling `toRgb`
   * — passing one is a programmer error that throws.
   */
  it('throws when given a theme-slot color', () => {
    const themeColor = { kind: 'theme', slot: 'accent1' } as unknown as BroadsetColor;

    expect(() => toRgb(themeColor)).toThrow();
  });
});

describe('gamutMap', () => {
  /**
   * @description sRGB colors already in gamut pass through with the
   * same hex (gamut mapping is a no-op for in-gamut inputs).
   */
  it('leaves an in-gamut sRGB color unchanged', () => {
    const color = rgb('#336699');
    const result = gamutMap(color);

    expect(result).toMatchObject({ kind: 'rgb', hex: '#336699' });
  });

  /**
   * @description A display-p3 color that's outside sRGB gets chroma-
   * reduced while preserving hue; the result is a valid sRGB hex.
   */
  it('clamps a display-p3 color into sRGB gamut', () => {
    const color: BroadsetColor = {
      kind: 'rgb',
      hex: '#ff0000',
      space: 'display-p3',
      originalColor: 'color(display-p3 1 0 0)',
    };
    const result = gamutMap(color);

    expect(result.kind).toBe('rgb');

    if (result.kind !== 'rgb') throw new Error('expected rgb');

    expect(/^#[0-9a-f]{6,8}$/.test(result.hex)).toBe(true);
  });

  /**
   * @description Theme colors pass through `gamutMap` unchanged —
   * clamping must happen after palette resolution.
   */
  it('passes theme colors through unchanged', () => {
    const themeColor: BroadsetColor = { kind: 'theme', slot: 'accent1' };
    const result = gamutMap(themeColor);

    expect(result).toBe(themeColor);
  });
});

describe('applyMods', () => {
  /**
   * @description `undefined` mods pass the color through unchanged —
   * callers invoke applyMods unconditionally on every stop / style
   * path.
   */
  it('returns the input unchanged when mods is undefined', () => {
    const color = rgb('#123456');

    expect(applyMods(color, undefined)).toBe(color);
  });

  /**
   * @description A mods object with no defined fields is a no-op.
   */
  it('returns the input unchanged when mods has no fields set', () => {
    const color = rgb('#123456');

    expect(applyMods(color, {})).toBe(color);
  });

  /**
   * @description `tint` lightens the color toward white. The result's
   * average channel value must exceed the source's.
   */
  it('tint lightens the color toward white', () => {
    const source = rgb('#336699');
    const result = applyMods(source, { tint: 0.5 });

    if (result.kind !== 'rgb') throw new Error('expected rgb');

    const sourceRgb = toRgb(source);
    const resultRgb = toRgb(result);
    const sourceAvg = (sourceRgb.r + sourceRgb.g + sourceRgb.b) / 3;
    const resultAvg = (resultRgb.r + resultRgb.g + resultRgb.b) / 3;

    expect(resultAvg).toBeGreaterThan(sourceAvg);
  });

  /**
   * @description `shade` darkens the color toward black. The result's
   * average channel value must be below the source's.
   */
  it('shade darkens the color toward black', () => {
    const source = rgb('#336699');
    const result = applyMods(source, { shade: 0.5 });

    if (result.kind !== 'rgb') throw new Error('expected rgb');

    const sourceRgb = toRgb(source);
    const resultRgb = toRgb(result);
    const sourceAvg = (sourceRgb.r + sourceRgb.g + sourceRgb.b) / 3;
    const resultAvg = (resultRgb.r + resultRgb.g + resultRgb.b) / 3;

    expect(resultAvg).toBeLessThan(sourceAvg);
  });

  /**
   * @description `alpha` modifier multiplies any existing alpha so the
   * result carries the reduced-opacity value in hex.
   */
  it('alpha multiplies the output alpha channel', () => {
    const source = rgb('#336699ff');
    const result = applyMods(source, { alpha: 0.5 });

    if (result.kind !== 'rgb') throw new Error('expected rgb');

    expect(result.hex.length).toBe(9);

    const alphaByte = Number.parseInt(result.hex.slice(7, 9), 16);

    expect(alphaByte).toBeLessThan(0xff);
  });

  /**
   * @description Theme colors remain theme-typed after applyMods —
   * the palette-aware resolver is the canonical path for theme +
   * mods evaluation, not this sRGB-only operation.
   */
  it('leaves theme colors as theme colors (palette-aware path handles them)', () => {
    const themeColor: BroadsetColor = { kind: 'theme', slot: 'accent1', mods: { lumMod: 0.5 } };
    const result = applyMods(themeColor, { lumMod: 0.5 });

    expect(result).toBe(themeColor);
  });
});
