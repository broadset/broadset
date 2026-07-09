import { describe, expect, it } from 'vitest';

import { rgbColor } from './broadset-color';
import {
  type BroadsetFill,
  broadsetFillSchema,
  gradientFill,
  isGradientFill,
  isNoneFill,
  isPatternFill,
  isPictureFill,
  isSolidFill,
  noneFill,
  patternFill,
  pictureFill,
  solidFill,
} from './broadset-fill';

/**
 * Phase 1 unit #8 — `BroadsetFill` is the canonical discriminated
 * union that will replace the flat `fill` / `backgroundColor` /
 * `backgroundGradient` fields on `BroadsetElementStyle`. Picture and
 * pattern fills unlock PPTX `<a:blipFill>`, SVG `<pattern>`, PDF
 * tiling patterns, and every format's image-asset fill round-trip.
 * This first sub-commit (8a) is additive: it defines the types, Zod
 * schema, factories, and type guards. The field-type flip on
 * `BroadsetElementStyle` follows in a later sub-commit once renderer /
 * editor / formats consumers are migrated.
 */
describe('BroadsetFill factories', () => {
  /**
   * @description `noneFill()` produces the canonical absence marker.
   * Rejecting a nullable / undefined representation in favor of an
   * explicit `{ kind: 'none' }` keeps the discriminator exhaustive —
   * every caller can `switch` on `kind` with no fallthrough.
   */
  it('noneFill produces the canonical absence shape', () => {
    expect(noneFill()).toEqual<BroadsetFill>({ kind: 'none' });
  });

  /**
   * @description `solidFill(color)` embeds a full `BroadsetColor` so
   * theme references and non-sRGB round-trip survive — the same
   * contract every structured color field carries per IO-D-05.
   */
  it('solidFill embeds the BroadsetColor', () => {
    const color = rgbColor('#ff0000');

    expect(solidFill(color)).toEqual<BroadsetFill>({ kind: 'solid', color });
  });

  /**
   * @description `gradientFill` preserves the existing `BroadsetGradient`
   * shape verbatim so importers can hand a pre-built gradient directly
   * into the fill discriminator without massaging fields.
   */
  it('gradientFill wraps an existing gradient', () => {
    const gradient = {
      type: 'linear' as const,
      stops: [
        { color: rgbColor('#ffffff'), position: 0 },
        { color: rgbColor('#000000'), position: 100 },
      ],
      angle: 90,
    };

    expect(gradientFill(gradient)).toEqual<BroadsetFill>({ kind: 'gradient', gradient });
  });

  /**
   * @description `patternFill(options)` requires only `assetId`; other
   * fields are optional per the plan. Repeat defaults are applied at
   * render time, not at model construction, so the factory preserves
   * sparse input.
   */
  it('patternFill preserves the provided options and omits optional fields', () => {
    expect(patternFill({ assetId: 'pattern-1' })).toEqual<BroadsetFill>({ kind: 'pattern', assetId: 'pattern-1' });
  });

  /**
   * @description Full pattern options round-trip: `repeat` and
   * `transform` are preserved when provided.
   */
  it('patternFill preserves repeat and transform when provided', () => {
    const transform: readonly [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

    expect(
      patternFill({ assetId: 'pattern-1', repeat: 'repeat-x', transform }),
    ).toEqual<BroadsetFill>({ kind: 'pattern', assetId: 'pattern-1', repeat: 'repeat-x', transform });
  });

  /**
   * @description `pictureFill` requires `assetId` and `mode`. Per the
   * plan, importers bake any crop into the source image at import time
   * so the persisted model only carries `stretch` or `tile` — no crop
   * rectangles.
   */
  it('pictureFill preserves assetId and mode', () => {
    expect(
      pictureFill({ assetId: 'img-1', mode: 'stretch' }),
    ).toEqual<BroadsetFill>({ kind: 'picture', assetId: 'img-1', mode: 'stretch' });
  });
});

describe('BroadsetFill type guards', () => {
  /**
   * @description Each guard must narrow exclusively to its kind.
   * Reliable narrowing is what lets renderer / exporter switches drop
   * the `default:` fallback without runtime surprises.
   */
  it.each([
    [noneFill(), isNoneFill, 'none'],
    [solidFill(rgbColor('#ffffff')), isSolidFill, 'solid'],
    [
      gradientFill({
        type: 'linear',
        stops: [
          { color: rgbColor('#000000'), position: 0 },
          { color: rgbColor('#ffffff'), position: 100 },
        ],
      }),
      isGradientFill,
      'gradient',
    ],
    [patternFill({ assetId: 'pattern-1' }), isPatternFill, 'pattern'],
    [pictureFill({ assetId: 'img-1', mode: 'tile' }), isPictureFill, 'picture'],
  ] as const)('guards narrow to the expected kind', (fill, guard, kind) => {
    expect(guard(fill)).toBe(true);
    expect(fill.kind).toBe(kind);
  });

  /** @description A guard must reject any other kind so narrowing is precise. */
  it('rejects the non-matching kind', () => {
    expect(isSolidFill(noneFill())).toBe(false);
    expect(isPictureFill(patternFill({ assetId: 'x' }))).toBe(false);
    expect(isPatternFill(pictureFill({ assetId: 'x', mode: 'stretch' }))).toBe(false);
  });
});

describe('broadsetFillSchema', () => {
  /**
   * @description Every valid fill shape must pass the schema so
   * persisted documents round-trip cleanly through a load-time parse.
   */
  it('accepts every valid fill kind', () => {
    const solid: BroadsetFill = solidFill(rgbColor('#112233'));
    const none: BroadsetFill = noneFill();
    const gradient: BroadsetFill = gradientFill({
      type: 'radial',
      stops: [
        { color: rgbColor('#000000'), position: 0 },
        { color: rgbColor('#ffffff'), position: 100 },
      ],
      center: [50, 50],
    });
    const pattern: BroadsetFill = patternFill({ assetId: 'pattern-1', repeat: 'repeat' });
    const picture: BroadsetFill = pictureFill({
      assetId: 'img-1',
      mode: 'tile',
      preserveAspectRatio: 'meet',
    });

    expect(broadsetFillSchema.safeParse(solid).success).toBe(true);
    expect(broadsetFillSchema.safeParse(none).success).toBe(true);
    expect(broadsetFillSchema.safeParse(gradient).success).toBe(true);
    expect(broadsetFillSchema.safeParse(pattern).success).toBe(true);
    expect(broadsetFillSchema.safeParse(picture).success).toBe(true);
  });

  /**
   * @description Unknown `kind` values MUST be rejected — silent
   * acceptance would leak corrupted fills into the renderer. The
   * discriminator is closed.
   */
  it('rejects an unknown kind', () => {
    expect(broadsetFillSchema.safeParse({ kind: 'rainbow' }).success).toBe(false);
  });

  /**
   * @description A `solid` fill without a valid `BroadsetColor` MUST
   * be rejected — consumers rely on `color` being a full structured
   * value, not a bare string or undefined.
   */
  it('rejects solid without a BroadsetColor', () => {
    expect(broadsetFillSchema.safeParse({ kind: 'solid' }).success).toBe(false);
    expect(broadsetFillSchema.safeParse({ kind: 'solid', color: '#ffffff' }).success).toBe(false);
  });

  /**
   * @description `pattern` requires `assetId`; `picture` requires
   * `assetId` and `mode`. Missing either must be rejected so the
   * renderer can count on the fields being present.
   */
  it('rejects pattern / picture without the required asset fields', () => {
    expect(broadsetFillSchema.safeParse({ kind: 'pattern' }).success).toBe(false);
    expect(broadsetFillSchema.safeParse({ kind: 'picture', assetId: 'x' }).success).toBe(false);
    expect(broadsetFillSchema.safeParse({ kind: 'picture', mode: 'stretch' }).success).toBe(false);
  });

  /**
   * @description `pattern.repeat` must be one of the four CSS /
   * SVG-equivalent keywords. Arbitrary strings are rejected so
   * round-trip from an importer cannot produce a value the renderer
   * has no path for.
   */
  it('rejects unknown pattern repeat values', () => {
    expect(
      broadsetFillSchema.safeParse({ kind: 'pattern', assetId: 'x', repeat: 'repeat-diagonal' }).success,
    ).toBe(false);
  });

  /**
   * @description `picture.mode` is closed to `stretch` or `tile`. The
   * plan explicitly forbids crop as a model-level option — importers
   * bake crop into the image asset at import time.
   */
  it('rejects unknown picture mode values', () => {
    expect(broadsetFillSchema.safeParse({ kind: 'picture', assetId: 'x', mode: 'crop' }).success).toBe(false);
    expect(broadsetFillSchema.safeParse({ kind: 'picture', assetId: 'x', mode: 'cover' }).success).toBe(false);
  });
});
