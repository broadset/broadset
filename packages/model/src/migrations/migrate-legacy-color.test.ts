import { describe, expect, it } from 'vitest';

import { type BroadsetColor, broadsetColorSchema, isRgbBroadsetColor, type RgbBroadsetColor } from '../broadset-color';
import { migrateLegacyColor } from './migrate-legacy-color';

/**
 * `migrateLegacyColor` is the second sub-commit of Phase 1 unit #3 — it
 * converts every string-typed color value currently persisted on
 * `BroadsetElementStyle` (`fill`, `stroke`, `fontColor`, `backgroundColor`,
 * `borderColor`, gradient stop colors) into a `BroadsetColor`. The cascade
 * that flips the field types downstream (unit #3c+) calls this migrator at
 * the document loader's initial validation pass so each consumer sees the
 * discriminated-union shape. The tests below pin the migrator's contract
 * before the type migration lands so future loops can rely on a canonical
 * one-site conversion helper.
 */
describe('migrateLegacyColor', () => {
  /**
   * @description Absent color fields (undefined) must stay absent after
   * migration so optional legacy fields keep their "unset" shape. If the
   * migrator coerced `undefined` to a concrete color we would silently
   * introduce unwanted default fills on every legacy element.
   */
  it('returns undefined when the legacy value is undefined', () => {
    expect(migrateLegacyColor(undefined)).toBeUndefined();
  });

  /**
   * @description Null-typed legacy inputs come through JSON.parse as `null`
   * (e.g. stray placeholder rows in external fixtures). The migrator must
   * not throw on them and must treat them as "absent" so the downstream
   * schema's `.optional()` shape continues to validate.
   */
  it('returns undefined when the legacy value is null', () => {
    expect(migrateLegacyColor(null)).toBeUndefined();
  });

  /**
   * @description Current fixtures (see demo-utils.ts) frequently use
   * `fill ?? ''` to represent "no color". The empty string — including
   * whitespace-only strings — must round-trip to `undefined` so the
   * migrator is a no-op for unset fields and does not create an RGB black
   * by accident via `normalizeColor`.
   */
  it('returns undefined when the legacy value is an empty or whitespace string', () => {
    expect(migrateLegacyColor('')).toBeUndefined();
    expect(migrateLegacyColor('   ')).toBeUndefined();
    expect(migrateLegacyColor('\t\n')).toBeUndefined();
  });

  /**
   * @description The migrator's canonical sRGB path: a `#RRGGBB` hex string
   * becomes an `RgbBroadsetColor` whose `hex` field is the same value in
   * lowercase and whose discriminator is `'rgb'`. Per IO-D-05, no `space`
   * tag is set for sRGB inputs because the canonical `hex` already carries
   * the full information.
   */
  it('converts a #RRGGBB hex string to an sRGB BroadsetColor', () => {
    const result = migrateLegacyColor('#FF0000');

    expect(result).toBeDefined();
    expect(isRgbColor(result)).toBe(true);
    expect(result?.kind).toBe('rgb');

    if (result !== undefined && isRgbBroadsetColor(result)) {
      expect(result.hex).toBe('#ff0000');
      expect(result.space).toBeUndefined();
      expect(result.originalColor).toBeUndefined();
    }
  });

  /**
   * @description Alpha-inclusive hex (`#RRGGBBAA`) must round-trip through
   * the migrator so translucent backgrounds and fills survive the Phase 1
   * field-type migration without losing their alpha channel.
   */
  it('preserves alpha in #RRGGBBAA inputs', () => {
    const result = migrateLegacyColor('#112233aa');

    expect(result).toBeDefined();

    if (result !== undefined && isRgbBroadsetColor(result)) {
      expect(result.hex).toBe('#112233aa');
    }
  });

  /**
   * @description 3- and 4-digit shorthand hex inputs (e.g. `#abc`, `#abcd`)
   * expand to 6/8-digit canonical form. This must be covered because
   * current fixtures and panel inputs accept shorthand syntax.
   */
  it('expands 3- and 4-digit hex shorthands to canonical form', () => {
    expect(migrateLegacyColor('#abc')).toEqual<RgbBroadsetColor>({ kind: 'rgb', hex: '#aabbcc' });
    expect(migrateLegacyColor('#abcd')).toEqual<RgbBroadsetColor>({ kind: 'rgb', hex: '#aabbccdd' });
  });

  /**
   * @description CSS `rgb()` and `rgba()` literals map to hex form. Alpha
   * is preserved as the final two hex digits when present. Bare `rgb()`
   * without alpha yields a 6-digit hex without an alpha suffix.
   */
  it('converts rgb() and rgba() literals to hex form', () => {
    expect(migrateLegacyColor('rgb(255, 0, 0)')).toEqual<RgbBroadsetColor>({ kind: 'rgb', hex: '#ff0000' });
    expect(migrateLegacyColor('rgba(255, 0, 0, 0.5)')).toEqual<RgbBroadsetColor>({
      kind: 'rgb',
      hex: '#ff000080',
    });
  });

  /**
   * @description CSS `hsl()`/`hsla()` literals also migrate. The exact hex
   * depends on the HSL conversion math owned by `normalizeColor`; this
   * test pins the kind + the presence of a valid hex to keep the contract
   * resilient to minor rounding differences.
   */
  it('converts hsl() and hsla() literals to sRGB BroadsetColor', () => {
    const solid = migrateLegacyColor('hsl(0, 100%, 50%)');
    const translucent = migrateLegacyColor('hsla(120, 100%, 50%, 0.25)');

    expect(solid?.kind).toBe('rgb');
    expect(translucent?.kind).toBe('rgb');

    if (solid !== undefined && isRgbBroadsetColor(solid)) {
      expect(solid.hex).toMatch(/^#[0-9a-f]{6}$/);
    }

    if (translucent !== undefined && isRgbBroadsetColor(translucent)) {
      expect(translucent.hex).toMatch(/^#[0-9a-f]{8}$/);
    }
  });

  /**
   * @description CSS named colors (e.g. `red`, `transparent`) map to their
   * canonical sRGB hex. `transparent` is the only named color that carries
   * an alpha channel; the migrator must preserve it.
   */
  it('converts CSS named colors to sRGB hex', () => {
    expect(migrateLegacyColor('red')).toEqual<RgbBroadsetColor>({ kind: 'rgb', hex: '#ff0000' });
    expect(migrateLegacyColor('transparent')).toEqual<RgbBroadsetColor>({ kind: 'rgb', hex: '#00000000' });
  });

  /**
   * @description Leading and trailing whitespace and case variation are
   * normalized by the migrator so documents produced by tools that emit
   * `"  #FF0000 "` or `"RED"` land in the canonical shape.
   */
  it('trims whitespace and normalizes casing', () => {
    expect(migrateLegacyColor('  #FF0000  ')).toEqual<RgbBroadsetColor>({ kind: 'rgb', hex: '#ff0000' });
    expect(migrateLegacyColor('RED')).toEqual<RgbBroadsetColor>({ kind: 'rgb', hex: '#ff0000' });
  });

  /**
   * @description Per IO-D-05 non-sRGB color literals (`oklch(...)`,
   * `oklab(...)`, `color(display-p3 ...)`) must be preserved in
   * `originalColor` so exporters that support Color Level 4 can re-emit
   * the source syntax verbatim. The `space` tag mirrors what `parseColor`
   * detects from the prefix.
   */
  it('preserves non-sRGB Color Level 4 literals in originalColor with a space tag', () => {
    const oklch = migrateLegacyColor('oklch(70% 0.1 200)');
    const oklab = migrateLegacyColor('oklab(0.7 0.1 -0.2)');
    const displayP3 = migrateLegacyColor('color(display-p3 0.1 0.2 0.3)');

    expect(oklch?.kind).toBe('rgb');

    if (oklch !== undefined && isRgbBroadsetColor(oklch)) {
      expect(oklch.space).toBe('oklch');
      expect(oklch.originalColor).toBe('oklch(70% 0.1 200)');
    }

    expect(oklab?.kind).toBe('rgb');

    if (oklab !== undefined && isRgbBroadsetColor(oklab)) {
      expect(oklab.space).toBe('oklab');
      expect(oklab.originalColor).toBe('oklab(0.7 0.1 -0.2)');
    }

    expect(displayP3?.kind).toBe('rgb');

    if (displayP3 !== undefined && isRgbBroadsetColor(displayP3)) {
      expect(displayP3.space).toBe('display-p3');
      expect(displayP3.originalColor).toBe('color(display-p3 0.1 0.2 0.3)');
    }
  });

  /**
   * @description Unparseable legacy strings must throw. Per IO-D-18 the
   * migrator must never silently drop a value — the caller (document
   * loader) surfaces the failure as an import warning. Silent coercion to
   * a fallback hex would hide corrupt data and defeat the "no silent
   * drops" invariant.
   */
  it('throws when the legacy string cannot be parsed as any supported color literal', () => {
    expect(() => migrateLegacyColor('not a color')).toThrow();
    expect(() => migrateLegacyColor('#zzzzzz')).toThrow();
  });

  /**
   * @description The migrator's output must always pass the authoritative
   * `broadsetColorSchema` so downstream callers can rely on schema
   * invariants (hex pattern, optional space enum) without re-validating.
   * This is the canonical safety net that protects unit #3c+ from having
   * to re-check every migrator path.
   */
  it('produces values that pass broadsetColorSchema for all supported inputs', () => {
    const samples = [
      '#FF0000',
      '#abcd',
      'rgb(1,2,3)',
      'rgba(1,2,3,0.5)',
      'hsl(0,100%,50%)',
      'red',
      'oklch(70% 0.1 200)',
    ];

    for (const sample of samples) {
      const result = migrateLegacyColor(sample);

      expect(result).toBeDefined();

      if (result !== undefined) {
        expect(() => broadsetColorSchema.parse(result)).not.toThrow();
      }
    }
  });

  /**
   * @description Because legacy string fields can never encode a theme
   * reference, the migrator must never emit `kind: 'theme'`. This pins
   * the invariant so a later refactor that conflates the migrator with a
   * theme-token parser does not silently change behavior.
   */
  it('never emits a theme-kind BroadsetColor for any legacy string input', () => {
    const inputs = ['#123456', 'rgb(10, 20, 30)', 'hsl(120, 50%, 50%)', 'oklch(60% 0.1 180)'];

    for (const input of inputs) {
      const result = migrateLegacyColor(input);

      expect(result?.kind).toBe('rgb');
    }
  });
});

function isRgbColor(value: BroadsetColor | undefined): value is RgbBroadsetColor {
  return value?.kind === 'rgb';
}
