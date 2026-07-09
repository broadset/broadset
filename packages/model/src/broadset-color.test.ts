import { describe, expect, it } from 'vitest';

import {
  BROADSET_COLOR_SPACES,
  type BroadsetColor,
  broadsetColorSchema,
  type ColorMods,
  colorModsSchema,
  colorToCss,
  isBroadsetColor,
  isRgbBroadsetColor,
  isThemeBroadsetColor,
  parseColor,
  type RgbBroadsetColor,
  rgbColor,
  swatchSchema,
  THEME_SLOTS,
  themeColor,
  type ThemePalette,
  type ThemeSlot,
  themeSlotSchema,
} from './broadset-color';

/** @description The theme-slot vocabulary mirrors PowerPoint OOXML theme slots so PPTX/PSD/PDF importers can map `<a:schemeClr>` losslessly. Locking the list ensures we never accept an out-of-vocab slot from a fixture or importer. */
describe('THEME_SLOTS', () => {
  /** @description All 12 OOXML theme slots are exposed and Zod-validated. */
  it('exposes every supported theme slot', () => {
    expect(THEME_SLOTS).toEqual([
      'accent1',
      'accent2',
      'accent3',
      'accent4',
      'accent5',
      'accent6',
      'lt1',
      'lt2',
      'dk1',
      'dk2',
      'hlink',
      'folHlink',
    ]);
  });

  /** @description An unknown slot value is rejected by `themeSlotSchema`. */
  it('rejects unknown theme slot values', () => {
    expect(themeSlotSchema.safeParse('accent7').success).toBe(false);
    expect(themeSlotSchema.safeParse('not-a-slot').success).toBe(false);
  });

  /** @description Every value in `THEME_SLOTS` is itself a valid `ThemeSlot`. */
  it('round-trips every constant value through the schema', () => {
    for (const slot of THEME_SLOTS) {
      expect(themeSlotSchema.parse(slot)).toBe(slot);
    }
  });
});

/** @description The Color Level 4 color spaces Broadset preserves on `RgbBroadsetColor.space`. */
describe('BROADSET_COLOR_SPACES', () => {
  /** @description The exposed list matches `space` discriminants used by the renderer and PDF/SVG exporters. */
  it('exposes srgb, display-p3, oklch, oklab', () => {
    expect(BROADSET_COLOR_SPACES).toEqual(['srgb', 'display-p3', 'oklch', 'oklab']);
  });
});

/** @description Factories let callers construct valid colors without thinking about object shape. */
describe('rgbColor / themeColor factories', () => {
  /** @description `rgbColor` normalizes through `normalizeColor` so any CSS color literal becomes a canonical hex. */
  it('rgbColor normalizes named/rgb/hex inputs to lowercase hex', () => {
    expect(rgbColor('red')).toEqual({ kind: 'rgb', hex: '#ff0000' });
    expect(rgbColor('rgb(255, 128, 0)')).toEqual({ kind: 'rgb', hex: '#ff8000' });
    expect(rgbColor('#ABC')).toEqual({ kind: 'rgb', hex: '#aabbcc' });
  });

  /** @description Optional `space` and `originalColor` are preserved when supplied. */
  it('rgbColor preserves space and originalColor when supplied', () => {
    const oklch = rgbColor('#336699', { space: 'oklch', originalColor: 'oklch(50% 0.1 240)' });

    expect(oklch.space).toBe('oklch');
    expect(oklch.originalColor).toBe('oklch(50% 0.1 240)');
  });

  /** @description Unparseable input throws — we never silently produce `#000000`. */
  it('rgbColor throws on unparseable input', () => {
    expect(() => rgbColor('rainbow')).toThrow('Unable to normalize color');
  });

  /** @description `themeColor` builds a discriminated union with optional `mods`. */
  it('themeColor builds a slot reference with optional mods', () => {
    expect(themeColor('accent1')).toEqual({ kind: 'theme', slot: 'accent1' });
    expect(themeColor('accent2', { lumMod: 0.5 })).toEqual({
      kind: 'theme',
      slot: 'accent2',
      mods: { lumMod: 0.5 },
    });
  });

  /** @description Type guards narrow the discriminated union safely without `as` casts at call sites. */
  it('isRgbBroadsetColor / isThemeBroadsetColor narrow correctly', () => {
    const rgb: BroadsetColor = rgbColor('#fff');
    const theme: BroadsetColor = themeColor('dk1');

    expect(isRgbBroadsetColor(rgb)).toBe(true);
    expect(isRgbBroadsetColor(theme)).toBe(false);
    expect(isThemeBroadsetColor(rgb)).toBe(false);
    expect(isThemeBroadsetColor(theme)).toBe(true);
  });
});

/** @description Zod validation is the runtime boundary for any imported / persisted color. */
describe('broadsetColorSchema', () => {
  /** @description A valid RGB color round-trips. */
  it('accepts a minimal RGB color', () => {
    const color: BroadsetColor = { kind: 'rgb', hex: '#aabbcc' };

    expect(broadsetColorSchema.parse(color)).toEqual(color);
  });

  /** @description A valid theme color with mods round-trips. */
  it('accepts a theme color with mods', () => {
    const color: BroadsetColor = {
      kind: 'theme',
      slot: 'accent1',
      mods: { lumMod: 0.5, alpha: 0.8 },
    };

    expect(broadsetColorSchema.parse(color)).toEqual(color);
  });

  /** @description Hex strings are lowercased on parse so equality comparisons across importers stay stable. */
  it('lowercases hex on parse', () => {
    const color = broadsetColorSchema.parse({ kind: 'rgb', hex: '#AABBCC' });

    expect(color.kind).toBe('rgb');
    if (color.kind === 'rgb') expect(color.hex).toBe('#aabbcc');
  });

  /** @description Hex strings shorter than 7 chars or with invalid chars are rejected. */
  it('rejects malformed hex', () => {
    expect(broadsetColorSchema.safeParse({ kind: 'rgb', hex: '#abc' }).success).toBe(false);
    expect(broadsetColorSchema.safeParse({ kind: 'rgb', hex: '#zzzzzz' }).success).toBe(false);
    expect(broadsetColorSchema.safeParse({ kind: 'rgb', hex: 'red' }).success).toBe(false);
  });

  /** @description An unknown theme slot is rejected (defensive against malformed importer output). */
  it('rejects unknown theme slot', () => {
    expect(broadsetColorSchema.safeParse({ kind: 'theme', slot: 'accent7' }).success).toBe(false);
  });

  /** @description Mods outside [0, 1] are rejected. */
  it('rejects ColorMods outside the [0, 1] range', () => {
    expect(colorModsSchema.safeParse({ lumMod: 1.5 }).success).toBe(false);
    expect(colorModsSchema.safeParse({ alpha: -0.1 }).success).toBe(false);
    expect(colorModsSchema.safeParse({ tint: 0, shade: 1, alpha: 0.5 }).success).toBe(true);
  });

  /** @description The discriminator must be `rgb` or `theme`. */
  it('rejects an unknown kind', () => {
    expect(broadsetColorSchema.safeParse({ kind: 'cmyk', c: 0, m: 0, y: 0, k: 0 }).success).toBe(false);
  });
});

/** @description The `isBroadsetColor` type guard is the cheap runtime check at trust boundaries. */
describe('isBroadsetColor', () => {
  /** @description Valid colors pass the guard; everything else fails. */
  it('returns true for valid colors and false for non-colors', () => {
    expect(isBroadsetColor(rgbColor('#abc'))).toBe(true);
    expect(isBroadsetColor(themeColor('accent1'))).toBe(true);
    expect(isBroadsetColor(null)).toBe(false);
    expect(isBroadsetColor('#abc')).toBe(false);
    expect(isBroadsetColor({ kind: 'rgb' })).toBe(false);
  });
});

/** @description `parseColor` is the migration on-ramp from legacy CSS color strings to `BroadsetColor`. */
describe('parseColor', () => {
  /** @description Plain sRGB inputs become `kind: 'rgb'` with no `space`/`originalColor` baggage. */
  it('parses sRGB inputs without tagging space', () => {
    const parsed = parseColor('#ff8000');

    expect(parsed).toEqual({ kind: 'rgb', hex: '#ff8000' });
  });

  /** @description `oklch(...)` inputs are tagged `space: 'oklch'` and the original CSS string is preserved. */
  it('preserves oklch() input via originalColor + space tag', () => {
    const parsed = parseColor('oklch(50% 0.1 240)');

    expect(parsed.space).toBe('oklch');
    expect(parsed.originalColor).toBe('oklch(50% 0.1 240)');
  });

  /** @description `oklab(...)` inputs are tagged `space: 'oklab'`. */
  it('preserves oklab() input via originalColor + space tag', () => {
    const parsed = parseColor('oklab(0.5 0.05 -0.1)');

    expect(parsed.space).toBe('oklab');
    expect(parsed.originalColor).toBe('oklab(0.5 0.05 -0.1)');
  });

  /** @description `color(display-p3 ...)` inputs are tagged `space: 'display-p3'`. */
  it('preserves color(display-p3 …) input via originalColor + space tag', () => {
    const parsed = parseColor('color(display-p3 0.5 0.4 0.3)');

    expect(parsed.space).toBe('display-p3');
    expect(parsed.originalColor).toBe('color(display-p3 0.5 0.4 0.3)');
  });

  /** @description Non-sRGB inputs without an embedded hex hint still parse — fallback hex is `#000000`. The originalColor is the source of truth. */
  it('falls back to #000000 hex when a non-sRGB input has no embedded hex', () => {
    const parsed = parseColor('oklch(50% 0.1 240)');

    expect(parsed.hex).toBe('#000000');
  });

  /** @description Unparseable input throws (no silent black). */
  it('throws on unparseable input', () => {
    expect(() => parseColor('not-a-color')).toThrow('Unable to normalize color');
  });
});

/** @description `colorToCss` resolves either branch of the union to a renderer-consumable string. */
describe('colorToCss', () => {
  const palette: ThemePalette = {
    accent1: rgbColor('#1a73e8'),
    accent2: rgbColor('#34a853'),
    accent3: rgbColor('#fbbc04'),
    accent4: rgbColor('#ea4335'),
    accent5: rgbColor('#ff6d01'),
    accent6: rgbColor('#46bdc6'),
    lt1: rgbColor('#ffffff'),
    lt2: rgbColor('#f1f3f4'),
    dk1: rgbColor('#000000'),
    dk2: rgbColor('#202124'),
    hlink: rgbColor('#1967d2'),
    folHlink: rgbColor('#7627bb'),
  };

  /** @description An sRGB color resolves to its canonical hex. */
  it('returns hex for a plain sRGB color', () => {
    expect(colorToCss(rgbColor('#abcdef'))).toBe('#abcdef');
  });

  /** @description A non-sRGB color resolves to `originalColor` so the renderer can emit `oklch(...)` losslessly. */
  it('prefers originalColor over hex when present', () => {
    const oklch = rgbColor('#336699', { space: 'oklch', originalColor: 'oklch(50% 0.1 240)' });

    expect(colorToCss(oklch)).toBe('oklch(50% 0.1 240)');
  });

  /** @description Theme colors resolve via the palette. */
  it('resolves a theme color via the palette', () => {
    expect(colorToCss(themeColor('accent1'), { palette })).toBe('#1a73e8');
  });

  /** @description Resolving a theme color without a palette throws (IO-D-05 — never silently downgrade). */
  it('throws when resolving a theme color without a palette', () => {
    expect(() => colorToCss(themeColor('accent1'))).toThrow('Cannot resolve theme color');
  });

  /** @description Theme colors with `mods` need an `applyMods` callback (lives in `_shared/color`); throwing here surfaces the contract. */
  it('throws when theme mods are present without an applyMods callback', () => {
    const colorWithMods = themeColor('accent1', { lumMod: 0.5 });

    expect(() => colorToCss(colorWithMods, { palette })).toThrow(/applyMods/);
  });

  /** @description When `applyMods` is supplied it is invoked with the resolved palette color and the mods. */
  it('invokes applyMods with the resolved palette color when supplied', () => {
    const colorWithMods = themeColor('accent1', { lumMod: 0.5 });
    const calls: ReadonlyArray<readonly [RgbBroadsetColor, ColorMods]>[] = [];

    const applyMods = (c: RgbBroadsetColor, m: ColorMods): RgbBroadsetColor => {
      calls.push([[c, m]]);

      return rgbColor('#0d3974');
    };

    expect(colorToCss(colorWithMods, { palette, applyMods })).toBe('#0d3974');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]?.[0].hex).toBe('#1a73e8');
    expect(calls[0]?.[0]?.[1]).toEqual({ lumMod: 0.5 });
  });
});

/** @description Swatch entries persist in `settings.palette` and round-trip through importers/exporters. */
describe('swatchSchema', () => {
  /** @description A simple swatch with id + color round-trips. */
  it('accepts a minimal swatch', () => {
    const swatch = { id: 'brand-blue', color: rgbColor('#1a73e8') };

    expect(swatchSchema.parse(swatch)).toEqual(swatch);
  });

  /** @description A swatch with a name and spot metadata round-trips. */
  it('accepts a swatch with name and spot metadata', () => {
    const swatch = {
      id: 'pms-185c',
      name: 'PMS 185 C',
      color: rgbColor('#e6002b'),
      spot: { name: 'PANTONE 185 C', cmyk: [0, 0.95, 0.85, 0] as const },
    };

    expect(swatchSchema.parse(swatch)).toEqual(swatch);
  });

  /** @description A swatch missing an `id` is rejected — id is the persisted handle. */
  it('rejects a swatch without an id', () => {
    expect(swatchSchema.safeParse({ color: rgbColor('#fff') }).success).toBe(false);
  });

  /** @description CMYK fractions outside [0, 1] are rejected. */
  it('rejects out-of-range CMYK values', () => {
    expect(
      swatchSchema.safeParse({
        id: 'invalid',
        color: rgbColor('#fff'),
        spot: { name: 'BAD', cmyk: [1.5, 0, 0, 0] },
      }).success,
    ).toBe(false);
  });
});

/** @description Imported `ThemeSlot` type is structurally usable in palette declarations. */
describe('ThemeSlot type', () => {
  /** @description A `ThemePalette` literal must enumerate every slot. */
  it('a ThemePalette literal must include every slot', () => {
    const slotsInPalette: readonly ThemeSlot[] = THEME_SLOTS;

    expect(slotsInPalette).toHaveLength(12);
  });
});
