import { describe, expect, it } from 'vitest';

import { rgbColor, themeColor } from './broadset-color';
import {
  blurFilter,
  brightnessFilter,
  colorMatrixFilter,
  contrastFilter,
  customSvgFilter,
  dropShadowFilter,
  type FilterPrimitive,
  type FilterStack,
  filterStackSchema,
  filterStackToCss,
  grayscaleFilter,
  hueRotateFilter,
  invertFilter,
  opacityFilter,
  saturateFilter,
  sepiaFilter,
  SIMPLE_FILTER_KINDS,
} from './filter-stack';

/**
 * Phase 1 unit #6 — the single-string `filter` / `backdropFilter`
 * style fields are being replaced with structured `FilterStack`
 * primitives so importers can round-trip PSD's ten layer effects,
 * SVG `<filter>` primitives, and PDF ExtGState blend chains without
 * flattening the information into an opaque CSS string. This first
 * sub-commit (6a) lands the primitive types, Zod schema, factories,
 * and `filterStackToCss` renderer-friendly view. The field-type flip
 * on `BroadsetElementStyle` follows in a later sub-commit once the
 * renderer / editor consumers have caught up.
 */
describe('FilterStack primitive factories', () => {
  /**
   * @description `blurFilter(stdDeviation)` must produce the canonical
   * shape so callers never hand-construct the discriminator and drift
   * away from the type.
   */
  it('blurFilter produces the canonical shape', () => {
    expect(blurFilter(4)).toEqual<FilterPrimitive>({ kind: 'blur', stdDeviation: 4 });
  });

  /**
   * @description `dropShadowFilter` must preserve every provided field
   * and embed the full `BroadsetColor` so theme references and Color
   * Level 4 literals survive the round-trip through the filter stack.
   */
  it('dropShadowFilter preserves offsets, blur, and color', () => {
    const color = rgbColor('#112233');

    expect(
      dropShadowFilter({ offsetX: 2, offsetY: 4, blur: 6, color }),
    ).toEqual<FilterPrimitive>({ kind: 'drop-shadow', offsetX: 2, offsetY: 4, blur: 6, color });
  });

  /**
   * @description The eight amount-based primitives all share a uniform
   * factory: kind + numeric amount. This keeps the factory surface
   * mechanical and discoverable.
   */
  it.each([
    [brightnessFilter, 'brightness'],
    [contrastFilter, 'contrast'],
    [saturateFilter, 'saturate'],
    [hueRotateFilter, 'hue-rotate'],
    [grayscaleFilter, 'grayscale'],
    [sepiaFilter, 'sepia'],
    [invertFilter, 'invert'],
    [opacityFilter, 'opacity'],
  ] as const)('%s simple-amount factory yields the correct discriminator', (factory, kind) => {
    expect(factory(0.5)).toEqual<FilterPrimitive>({ kind, amount: 0.5 });
  });

  /**
   * @description `colorMatrixFilter` accepts a readonly matrix of
   * numbers. The matrix is preserved verbatim since SVG's
   * feColorMatrix takes either 4x5 or 5x5 layouts and the model-layer
   * validator shouldn't second-guess the caller's intent.
   */
  it('colorMatrixFilter preserves the matrix', () => {
    const matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

    expect(colorMatrixFilter(matrix)).toEqual<FilterPrimitive>({ kind: 'color-matrix', matrix });
  });

  /**
   * @description `customSvgFilter` is the escape hatch for arbitrary
   * SVG `<filter>` fragments that do not map to any primitive. The
   * string is preserved verbatim for later sanitization at the
   * renderer boundary.
   */
  it('customSvgFilter preserves the svg payload', () => {
    const svg = '<feGaussianBlur stdDeviation="2" />';

    expect(customSvgFilter(svg)).toEqual<FilterPrimitive>({ kind: 'custom-svg', svg });
  });
});

describe('filterStackSchema', () => {
  /**
   * @description An empty stack is a valid no-op filter. Rejecting
   * empty stacks would force callers to represent "no filter" as
   * `undefined` AND `[]` inconsistently.
   */
  it('accepts an empty stack', () => {
    expect(filterStackSchema.safeParse([]).success).toBe(true);
  });

  /**
   * @description Every primitive kind must pass schema validation so
   * round-trip from an importer does not trip on the Broadset-owned
   * schema.
   */
  it('accepts a stack containing every primitive kind', () => {
    const stack: FilterStack = [
      blurFilter(4),
      dropShadowFilter({ offsetX: 1, offsetY: 2, blur: 3, color: rgbColor('#000000') }),
      colorMatrixFilter([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]),
      brightnessFilter(1),
      contrastFilter(1),
      saturateFilter(1),
      hueRotateFilter(45),
      grayscaleFilter(0.5),
      sepiaFilter(0.25),
      invertFilter(1),
      opacityFilter(0.5),
      customSvgFilter('<feGaussianBlur stdDeviation="1" />'),
    ];

    expect(filterStackSchema.safeParse(stack).success).toBe(true);
  });

  /**
   * @description An unknown discriminator MUST be rejected — silent
   * acceptance would let corrupted filter payloads flow into the
   * renderer, which expects the closed set of kinds.
   */
  it('rejects a primitive with an unknown kind', () => {
    const invalid = [{ kind: 'warp', amount: 1 }];

    expect(filterStackSchema.safeParse(invalid).success).toBe(false);
  });

  /**
   * @description Missing required fields on a primitive MUST be
   * rejected. This pins the shape so downstream consumers can rely on
   * the declared fields being present.
   */
  it('rejects a drop-shadow missing its color', () => {
    const invalid = [{ kind: 'drop-shadow', offsetX: 1, offsetY: 2, blur: 3 }];

    expect(filterStackSchema.safeParse(invalid).success).toBe(false);
  });

  /**
   * @description `blur` must have a non-negative `stdDeviation` — the
   * SVG spec forbids negative Gaussian radii. Accepting them would
   * push the invalidation burden onto the renderer.
   */
  it('rejects a blur with negative stdDeviation', () => {
    expect(filterStackSchema.safeParse([blurFilter(-1)]).success).toBe(false);
  });
});

describe('filterStackToCss', () => {
  /**
   * @description An empty stack maps to the empty string so callers
   * can unconditionally assign the output to `element.style.filter`
   * without extra guards.
   */
  it('returns an empty string for an empty stack', () => {
    expect(filterStackToCss([])).toBe('');
  });

  /**
   * @description Amount-based primitives that CSS represents as
   * `fn(amount)` must produce the same token. The `hue-rotate`
   * primitive additionally appends the `deg` unit.
   */
  it('emits the canonical CSS token for each amount-based primitive', () => {
    expect(filterStackToCss([brightnessFilter(0.5)])).toBe('brightness(0.5)');
    expect(filterStackToCss([contrastFilter(1.2)])).toBe('contrast(1.2)');
    expect(filterStackToCss([saturateFilter(1)])).toBe('saturate(1)');
    expect(filterStackToCss([grayscaleFilter(0.25)])).toBe('grayscale(0.25)');
    expect(filterStackToCss([sepiaFilter(0.1)])).toBe('sepia(0.1)');
    expect(filterStackToCss([invertFilter(1)])).toBe('invert(1)');
    expect(filterStackToCss([opacityFilter(0.5)])).toBe('opacity(0.5)');
    expect(filterStackToCss([hueRotateFilter(90)])).toBe('hue-rotate(90deg)');
  });

  /**
   * @description `blur(stdDeviation)` emits in CSS pixel units because
   * CSS `filter: blur(…)` only accepts a length, not a bare number.
   */
  it('emits blur in CSS pixel units', () => {
    expect(filterStackToCss([blurFilter(4)])).toBe('blur(4px)');
  });

  /**
   * @description `drop-shadow` emits `drop-shadow(x y blur color)` with
   * CSS length units and the resolved BroadsetColor. This matches the
   * CSS `filter: drop-shadow(...)` syntax so the CSS property assigns
   * cleanly in the renderer.
   */
  it('emits drop-shadow with resolved color', () => {
    const shadow: FilterPrimitive = dropShadowFilter({
      offsetX: 2,
      offsetY: 4,
      blur: 6,
      color: rgbColor('#112233'),
    });

    expect(filterStackToCss([shadow])).toBe('drop-shadow(2px 4px 6px #112233)');
  });

  /**
   * @description Multiple primitives are concatenated with a single
   * space. That is the CSS grammar for filter function lists and
   * matches what every real browser parses.
   */
  it('concatenates multiple primitives with a single space', () => {
    const stack: FilterStack = [blurFilter(2), brightnessFilter(0.8)];

    expect(filterStackToCss(stack)).toBe('blur(2px) brightness(0.8)');
  });

  /**
   * @description `color-matrix` and `custom-svg` have no CSS
   * equivalent — they must be expressed via an SVG `<filter>` referenced
   * by `url(...)`. The model-level helper SHOULD silently skip them
   * rather than emit invalid CSS; the renderer is responsible for
   * routing them through an SVG filter definition.
   */
  it('skips primitives without a direct CSS equivalent', () => {
    const matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    const stack: FilterStack = [
      blurFilter(2),
      colorMatrixFilter(matrix),
      customSvgFilter('<feGaussianBlur stdDeviation="1" />'),
      brightnessFilter(0.8),
    ];

    expect(filterStackToCss(stack)).toBe('blur(2px) brightness(0.8)');
  });

  /**
   * @description `drop-shadow` with a theme color requires a
   * `ColorResolutionContext` so the palette can resolve. Without the
   * context the helper throws (propagating colorToCss's no-silent-
   * downgrade contract per IO-D-05).
   */
  it('throws when a drop-shadow uses a theme color without palette context', () => {
    const shadow = dropShadowFilter({
      offsetX: 0,
      offsetY: 0,
      blur: 4,
      color: themeColor('accent1'),
    });

    expect(() => filterStackToCss([shadow])).toThrow();
  });

  /**
   * @description When a `ColorResolutionContext.palette` is provided,
   * a theme-color drop-shadow resolves to the palette hex.
   */
  it('resolves a theme-color drop-shadow through the provided palette', () => {
    const shadow = dropShadowFilter({
      offsetX: 0,
      offsetY: 0,
      blur: 4,
      color: themeColor('accent1'),
    });
    const resolved = filterStackToCss([shadow], {
      palette: {
        accent1: { kind: 'rgb', hex: '#ff0000' },
        accent2: { kind: 'rgb', hex: '#00ff00' },
        accent3: { kind: 'rgb', hex: '#0000ff' },
        accent4: { kind: 'rgb', hex: '#ffffff' },
        accent5: { kind: 'rgb', hex: '#000000' },
        accent6: { kind: 'rgb', hex: '#808080' },
        lt1: { kind: 'rgb', hex: '#eeeeee' },
        lt2: { kind: 'rgb', hex: '#dddddd' },
        dk1: { kind: 'rgb', hex: '#222222' },
        dk2: { kind: 'rgb', hex: '#444444' },
        hlink: { kind: 'rgb', hex: '#0000ee' },
        folHlink: { kind: 'rgb', hex: '#551a8b' },
      },
    });

    expect(resolved).toBe('drop-shadow(0px 0px 4px #ff0000)');
  });
});

describe('SIMPLE_FILTER_KINDS', () => {
  /**
   * @description `SIMPLE_FILTER_KINDS` MUST enumerate every amount-
   * based primitive kind. Consumers iterate over this constant (e.g.
   * UI filter pickers) and a missing entry would hide a primitive
   * from the editor. This test pins the contract to eight kinds.
   */
  it('enumerates every amount-based primitive kind', () => {
    expect<ReadonlyArray<string>>(SIMPLE_FILTER_KINDS).toEqual([
      'brightness',
      'contrast',
      'saturate',
      'hue-rotate',
      'grayscale',
      'sepia',
      'invert',
      'opacity',
    ]);
  });
});

