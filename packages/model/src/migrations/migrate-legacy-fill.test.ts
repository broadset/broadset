import { describe, expect, it } from 'vitest';

import type { BroadsetColor, RgbBroadsetColor, ThemeBroadsetColor } from '../broadset-color';
import {
  broadsetFillSchema,
  isGradientFill,
  isNoneFill,
  isSolidFill,
} from '../broadset-fill';
import type { BroadsetGradient } from '../style';
import { migrateLegacyFill } from './migrate-legacy-fill';

/**
 * `migrateLegacyFill` is the second sub-commit of Phase 1 unit #8 — it
 * collapses the legacy trio `{ fill, backgroundColor, backgroundGradient }`
 * on `BroadsetElementStyle` into a single canonical `BroadsetFill`. The
 * cascade that flips the field types downstream (unit #8c) calls this
 * migrator at the document loader's initial validation pass so every
 * renderer / editor / formats / ui / demo consumer sees the
 * discriminated-union shape. The tests below pin the migrator's contract
 * before the type migration lands so future loops can rely on a canonical
 * one-site conversion helper.
 */
describe('migrateLegacyFill', () => {
  const RGB_RED: RgbBroadsetColor = { kind: 'rgb', hex: '#ff0000' };
  const RGB_BLUE: RgbBroadsetColor = { kind: 'rgb', hex: '#0000ff' };
  const RGB_DISPLAY_P3: RgbBroadsetColor = {
    kind: 'rgb',
    hex: '#f4431a',
    space: 'display-p3',
    originalColor: 'color(display-p3 1 0.2 0.1)',
  };
  const THEME_ACCENT1: ThemeBroadsetColor = {
    kind: 'theme',
    slot: 'accent1',
    mods: { lumMod: 0.75, alpha: 0.8 },
  };

  const LINEAR_GRADIENT: BroadsetGradient = {
    type: 'linear',
    stops: [
      { color: RGB_RED, position: 0 },
      { color: RGB_BLUE, position: 100 },
    ],
    angle: 90,
  };

  /**
   * @description When nothing is set on the legacy trio, the canonical
   * migration is `none`. If the migrator defaulted to `solid` or `gradient`
   * it would silently paint every previously-unset element.
   */
  it('returns noneFill when no legacy paint fields are set', () => {
    const result = migrateLegacyFill({});

    expect(isNoneFill(result)).toBe(true);
    expect(broadsetFillSchema.parse(result)).toEqual({ kind: 'none' });
  });

  /**
   * @description A rectangle / ellipse / group with only `backgroundColor`
   * becomes `solid` with the same color. This is the common case for
   * container-semantic elements in the demo fixtures.
   */
  it('returns solidFill from backgroundColor when only backgroundColor is set', () => {
    const result = migrateLegacyFill({ backgroundColor: RGB_RED });

    expect(isSolidFill(result)).toBe(true);

    if (!isSolidFill(result)) throw new Error('expected solidFill');

    expect(result.color).toEqual(RGB_RED);
  });

  /**
   * @description A path / svg-typed element with only `fill` (SVG-paint
   * field) becomes `solid` with the same color. Needed to migrate every
   * path element in the fixtures without touching `backgroundColor`.
   */
  it('returns solidFill from fill when only fill is set', () => {
    const result = migrateLegacyFill({ fill: RGB_BLUE });

    expect(isSolidFill(result)).toBe(true);

    if (!isSolidFill(result)) throw new Error('expected solidFill');

    expect(result.color).toEqual(RGB_BLUE);
  });

  /**
   * @description A structured gradient on `backgroundGradient` migrates to
   * `gradientFill` verbatim — the BroadsetGradient shape (type, stops,
   * angle, center, startAngle) must survive untouched so round-trip tests
   * that compare gradient equality continue to pass.
   */
  it('returns gradientFill from a structured backgroundGradient', () => {
    const result = migrateLegacyFill({ backgroundGradient: LINEAR_GRADIENT });

    expect(isGradientFill(result)).toBe(true);

    if (!isGradientFill(result)) throw new Error('expected gradientFill');

    expect(result.gradient).toEqual(LINEAR_GRADIENT);
  });

  /**
   * @description SVG-paint specificity: when both `fill` and
   * `backgroundColor` are present (legacy fixtures that mixed the two on
   * the same element), `fill` wins. Documented priority in the spec.
   */
  it('prefers fill over backgroundColor when both are set', () => {
    const result = migrateLegacyFill({ fill: RGB_BLUE, backgroundColor: RGB_RED });

    expect(isSolidFill(result)).toBe(true);

    if (!isSolidFill(result)) throw new Error('expected solidFill');

    expect(result.color).toEqual(RGB_BLUE);
  });

  /**
   * @description The renderer's current precedence (gradient > solid
   * background) must survive migration. Legacy elements that declared
   * both fields relied on the gradient winning visually; the migrator
   * preserves that contract.
   */
  it('prefers backgroundGradient over backgroundColor when both are set', () => {
    const result = migrateLegacyFill({
      backgroundColor: RGB_RED,
      backgroundGradient: LINEAR_GRADIENT,
    });

    expect(isGradientFill(result)).toBe(true);
  });

  /**
   * @description Gradient wins over every solid input, whether that solid
   * came from `fill` or `backgroundColor`. This is the final priority rung.
   */
  it('prefers backgroundGradient over fill and backgroundColor when all three are set', () => {
    const result = migrateLegacyFill({
      fill: RGB_BLUE,
      backgroundColor: RGB_RED,
      backgroundGradient: LINEAR_GRADIENT,
    });

    expect(isGradientFill(result)).toBe(true);
  });

  /**
   * @description Legacy CSS-string gradients are no longer a supported
   * model surface post-unit-8. Per IO-D-18 the migrator must throw rather
   * than silently drop the value — the document loader surfaces the
   * failure as an import warning.
   */
  it('throws when backgroundGradient is a non-empty CSS string', () => {
    expect(() =>
      migrateLegacyFill({ backgroundGradient: 'linear-gradient(to right, red, blue)' }),
    ).toThrow();
  });

  /**
   * @description Empty and whitespace-only string gradients are treated as
   * "unset" rather than as corrupt values. Old fixtures occasionally
   * carried `backgroundGradient: ''` as a sentinel; treating that as
   * absent keeps the migrator idempotent.
   */
  it('treats empty and whitespace-only backgroundGradient strings as absent', () => {
    expect(isNoneFill(migrateLegacyFill({ backgroundGradient: '' }))).toBe(true);
    expect(isNoneFill(migrateLegacyFill({ backgroundGradient: '   ' }))).toBe(true);
    expect(isNoneFill(migrateLegacyFill({ backgroundGradient: '\t\n' }))).toBe(true);
  });

  /**
   * @description Theme references must survive migration intact — the
   * migrator MUST NOT silently flatten a theme color to an rgb equivalent.
   * Preserves IO-D-05 round-trip guarantees for PPTX / PSD theme colors.
   */
  it('preserves theme BroadsetColor identity through solid migration', () => {
    const result = migrateLegacyFill({ backgroundColor: THEME_ACCENT1 });

    expect(isSolidFill(result)).toBe(true);

    if (!isSolidFill(result)) throw new Error('expected solidFill');

    expect(result.color).toBe(THEME_ACCENT1);
  });

  /**
   * @description Non-sRGB sources carry `space` + `originalColor` for
   * lossless round-trip. The migrator must preserve the full
   * `BroadsetColor` identity, including those fields, through the solid
   * fill transformation.
   */
  it('preserves non-sRGB BroadsetColor through solid migration', () => {
    const result = migrateLegacyFill({ fill: RGB_DISPLAY_P3 });

    if (!isSolidFill(result)) throw new Error('expected solidFill');

    expect(result.color).toBe(RGB_DISPLAY_P3);
  });

  /**
   * @description Gradient stops carrying theme-color references must
   * survive migration unchanged so gradients authored against the
   * palette (e.g. accent1 → accent2 sweeps) round-trip through 8c
   * without losing theme identity.
   */
  it('preserves theme-colored gradient stops through migration', () => {
    const themedGradient: BroadsetGradient = {
      type: 'linear',
      stops: [
        { color: THEME_ACCENT1, position: 0 },
        { color: RGB_BLUE, position: 100 },
      ],
    };

    const result = migrateLegacyFill({ backgroundGradient: themedGradient });

    if (!isGradientFill(result)) throw new Error('expected gradientFill');

    expect(result.gradient).toBe(themedGradient);
    expect(result.gradient.stops[0]?.color).toBe(THEME_ACCENT1);
  });

  /**
   * @description Every successful migrator output must pass the canonical
   * `broadsetFillSchema`. This pins the invariant that the migrator never
   * produces a shape the Zod schema would reject downstream.
   */
  it('every successful output passes broadsetFillSchema', () => {
    const inputs: ReadonlyArray<
      Parameters<typeof migrateLegacyFill>[0] & { description: string }
    > = [
      { description: 'empty' },
      { description: 'backgroundColor', backgroundColor: RGB_RED },
      { description: 'fill', fill: RGB_BLUE },
      { description: 'gradient', backgroundGradient: LINEAR_GRADIENT },
      { description: 'theme color', backgroundColor: THEME_ACCENT1 },
    ];

    for (const { description, ...input } of inputs) {
      const output = migrateLegacyFill(input);

      expect(() => broadsetFillSchema.parse(output), description).not.toThrow();
    }
  });

  /**
   * @description Picture and pattern fills reference an asset-registry
   * entry — legacy style objects have no way to encode that reference.
   * The migrator MUST NOT manufacture a synthetic assetId; only
   * `none` / `solid` / `gradient` kinds are ever produced.
   */
  it('never emits pattern or picture kinds', () => {
    const outputs: ReadonlyArray<ReturnType<typeof migrateLegacyFill>> = [
      migrateLegacyFill({}),
      migrateLegacyFill({ backgroundColor: RGB_RED }),
      migrateLegacyFill({ fill: RGB_BLUE }),
      migrateLegacyFill({ backgroundGradient: LINEAR_GRADIENT }),
    ];

    for (const output of outputs) {
      expect(output.kind).not.toBe('pattern');
      expect(output.kind).not.toBe('picture');
    }
  });

  /**
   * @description The migrator must treat explicit `undefined` on any legacy
   * field as equivalent to "field absent". Consumers normalizing via
   * `{ fill: someValue ?? undefined }` patterns rely on this so the
   * migrator remains call-site-safe.
   */
  it('treats explicit undefined legacy fields as absent', () => {
    const absentBag: Parameters<typeof migrateLegacyFill>[0] = {
      fill: undefined,
      backgroundColor: undefined,
      backgroundGradient: undefined,
    };

    expect(isNoneFill(migrateLegacyFill(absentBag))).toBe(true);
  });
});

/**
 * Type-level probes — these exist so the test suite fails at type-check
 * time if the migrator's public type ever drifts. No runtime assertions.
 */
describe('migrateLegacyFill — type surface', () => {
  it('accepts the documented LegacyFillInput shape', () => {
    const fill: BroadsetColor = { kind: 'rgb', hex: '#123456' };
    const backgroundColor: BroadsetColor = { kind: 'rgb', hex: '#abcdef' };
    const backgroundGradient: BroadsetGradient = {
      type: 'linear',
      stops: [
        { color: fill, position: 0 },
        { color: backgroundColor, position: 100 },
      ],
    };

    // Compiles ⇒ the public input surface tolerates every documented shape.
    migrateLegacyFill({});
    migrateLegacyFill({ fill });
    migrateLegacyFill({ backgroundColor });
    migrateLegacyFill({ backgroundGradient });
    migrateLegacyFill({ fill, backgroundColor, backgroundGradient });

    expect(true).toBe(true);
  });
});
