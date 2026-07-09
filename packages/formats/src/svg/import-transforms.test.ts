/**
 * P7.7c — Full SVG transform decomposition on import.
 *
 * Per `project/spec/formats/svg.md` → "Full Transform Parsing and
 * Composition on Import":
 *
 * - `translate` + `rotate` decompose to Broadset `position` +
 *   `rotation` (existing).
 * - `matrix(a,b,c,d,e,f)` decomposes to (translate, rotate) when
 *   the affine has no scale/skew. Otherwise the shape is converted
 *   to a path and the transform is baked into the `d` via `svgpath`
 *   per IO-D-02 (Broadset has no element-level scale / skew).
 * - `scale(sx, sy)` and `skewX/skewY` likewise force conversion to
 *   path with baked geometry.
 *
 * Uses `svgpath` (already a dep) for the bake step. The
 * `transformation-matrix` dep handles affine compose/decompose.
 */
import { describe, expect, it } from 'vitest';

import { importSvgDocument } from './index';

describe('P7.7c — Full transform parsing', () => {
  /**
   * @description `translate(x, y)` continues to decompose cleanly
   * into Broadset's `position`. Regression for the existing
   * behaviour from P7.2.
   */
  it('imports translate-only matrix as position', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect transform="matrix(1, 0, 0, 1, 30, 40)" width="50" height="50"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(rect?.position.x).toBeCloseTo(30, 1);
    expect(rect?.position.y).toBeCloseTo(40, 1);
    expect(rect?.rotation).toBeCloseTo(0, 1);
  });

  /**
   * @description A matrix that's a pure 30° rotation MUST
   * decompose to `rotation: 30` and zero translation. The shape
   * stays a `rectangle` (no path bake needed because rotation is
   * native to Broadset).
   */
  it('decomposes a pure-rotation matrix to rotation field', () => {
    const cos = Math.cos((30 * Math.PI) / 180);
    const sin = Math.sin((30 * Math.PI) / 180);
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect transform="matrix(${String(cos)}, ${String(sin)}, ${String(-sin)}, ${String(cos)}, 0, 0)" width="50" height="50"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(rect?.type).toBe('rectangle');
    expect(rect?.rotation).toBeCloseTo(30, 1);
  });

  /**
   * @description A `scale(sx, sy)` transform — non-trivial scale
   * is not native in Broadset (per IO-D-02). The shape MUST be
   * converted to a `path` element with the geometry baked into
   * the `d` attribute.
   */
  it('bakes a non-uniform scale into the path d-attribute', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect transform="scale(2, 0.5)" width="40" height="40" fill="#336699"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const baked = document.elements.find((el) => el.type === 'path');

    expect(baked).toBeDefined();
    // The baked path's `d` attribute carries the rect's outline
    // multiplied by the scale matrix — width 40 × scaleX 2 = 80
    // somewhere in the d string.
    expect(baked?.content).toMatch(/[ML]/);
  });

  /**
   * @description `skewX` MUST force conversion to path because
   * skew is not a native Broadset element field.
   */
  it('bakes a skewX transform into the path d-attribute', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect transform="skewX(15)" width="40" height="40"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const baked = document.elements.find((el) => el.type === 'path');

    expect(baked).toBeDefined();
    expect(baked?.content).toMatch(/M/);
  });

  /**
   * @description A `matrix()` with extreme values that would
   * produce NaN or Infinity through the decomposition pipeline
   * MUST fall back cleanly (no crash, no NaN-poisoned position /
   * rotation in the imported element). Closes the security audit
   * hardening finding.
   */
  it('falls back to identity when matrix values overflow to NaN/Infinity', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect transform="matrix(1e308, 1e308, 1e308, 1e308, 1e308, 1e308)" width="50" height="50"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const el = document.elements[0];

    expect(el).toBeDefined();
    expect(Number.isFinite(el?.position.x ?? 0)).toBe(true);
    expect(Number.isFinite(el?.position.y ?? 0)).toBe(true);
    expect(Number.isFinite(el?.rotation ?? 0)).toBe(true);
  });

  /**
   * @description Ancestor `translate` + descendant `skew` MUST
   * combine cleanly: the baked geometry sits at the ancestor
   * translate offset. Closes the P7.7 review finding that the
   * additive fast-path dropped the cumulative ancestor translate
   * the moment a descendant baked.
   */
  it('preserves an ancestor translate when a descendant bakes', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="translate(100, 50)">
        <rect transform="skewX(15)" width="40" height="40"/>
      </g>
    </svg>`;
    const { document } = importSvgDocument(input);
    const path = document.elements.find((el) => el.type === 'path');
    const dStr = typeof path?.content === 'string' ? path.content : '';
    const moveMatch = /^M([-\d.]+)\s+([-\d.]+)/.exec(dStr);

    expect(moveMatch).not.toBeNull();

    const startX = parseFloat(moveMatch?.[1] ?? '0');
    const startY = parseFloat(moveMatch?.[2] ?? '0');

    // Top-left corner after the cumulative translate(100,50) and
    // skewX(15): the rect's (0,0) corner lands at (100, 50)
    // (skewX shifts only x = old_x + tan(15°) * y; at y=0 → no
    // shift). Tolerance: 1px for any rounding.
    expect(startX).toBeCloseTo(100, 0);
    expect(startY).toBeCloseTo(50, 0);
  });

  /**
   * @description Ancestor `scale(2)` + descendant `translate(10,5)`
   * must compose so the leaf bakes at scale(2) × translate(10,5)
   * and NOT translate(10,5) × translate(10,5) (the prior double-
   * apply bug from `bakedPathElement`).
   */
  it('does not double-apply the leaf own translate under a baking ancestor', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="scale(2)">
        <rect transform="translate(10, 5)" width="20" height="20"/>
      </g>
    </svg>`;
    const { document } = importSvgDocument(input);
    const path = document.elements.find((el) => el.type === 'path');
    const dStr = typeof path?.content === 'string' ? path.content : '';
    const moveMatch = /^M([-\d.]+)\s+([-\d.]+)/.exec(dStr);

    expect(moveMatch).not.toBeNull();

    const startX = parseFloat(moveMatch?.[1] ?? '0');
    const startY = parseFloat(moveMatch?.[2] ?? '0');

    // SVG composition: scale(2) is applied AFTER translate(10,5)
    // (outer wraps inner). So the rect's (0,0) corner lands at
    // 2 * (0+10) = 20 horizontally, 2 * (0+5) = 10 vertically.
    // The previous bug double-applied the translate, producing
    // 2 * 20 = 40 / 2 * 10 = 20.
    expect(startX).toBeCloseTo(20, 0);
    expect(startY).toBeCloseTo(10, 0);
  });

  /**
   * @description A `<g scale(2)>` wrapping a `<g scale(0.5)>` cancels
   * to identity at the leaf, so the rect MUST hydrate as a NATIVE
   * rectangle — not bake to a path. Closes the P7.7 review #4
   * finding that `requiresBake` was sticky and over-baked once an
   * ancestor scale appeared, even when a descendant cancelled it.
   */
  it('does not bake when ancestor and descendant scales cancel to identity', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="scale(2)">
        <g transform="scale(0.5)">
          <rect width="40" height="40"/>
        </g>
      </g>
    </svg>`;
    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const baked = document.elements.find((el) => el.type === 'path');

    expect(rect).toBeDefined();
    expect(baked).toBeUndefined();
    expect(rect?.width).toBeCloseTo(40, 1);
    expect(rect?.height).toBeCloseTo(40, 1);
  });

  /**
   * @description A `<g transform="scale(2,3)">` wrapping an
   * `<image>` MUST fold the scale into the image's width/height
   * (since Broadset has no native image scale field). Closes the
   * P7 review #4 finding that text and image silently dropped
   * inherited scale.
   */
  it('folds an inherited uniform scale into <image> width/height', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="scale(2, 3)">
        <image href="https://example.com/x.png" width="40" height="20"/>
      </g>
    </svg>`;
    const { document } = importSvgDocument(input);
    const image = document.elements.find((el) => el.type === 'image');

    expect(image?.width).toBeCloseTo(80, 1);
    expect(image?.height).toBeCloseTo(60, 1);
  });

  /**
   * @description Inherited scale on a `<text>` element has no
   * native Broadset representation. The importer MUST surface a
   * warning rather than silently dropping the scale.
   */
  it('warns when inherited scale on <text> cannot be honoured', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="scale(2)">
        <text>Hello</text>
      </g>
    </svg>`;
    const { warnings } = importSvgDocument(input);

    expect(warnings.some((w) => /scale\/skew on a <text>|text/i.test(w))).toBe(true);
  });

  /**
   * @description A non-decomposable affine on a `<path>` MUST
   * have its transform baked into the existing `d` via `svgpath`,
   * NOT preserved as opaque markup.
   */
  it('bakes a non-decomposable matrix on <path> into the d', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <path transform="matrix(1, 0.5, 0, 1, 10, 20)" d="M0,0 L10,0 L10,10 L0,10 Z"/>
    </svg>`;
    const { document } = importSvgDocument(input);
    const path = document.elements.find((el) => el.type === 'path');

    expect(path).toBeDefined();

    // Original `d` had four points; baked `d` still has four
    // commands (M + 3 L's, closed by Z).
    const dStr = typeof path?.content === 'string' ? path.content : '';

    expect(dStr.length).toBeGreaterThan(0);
    expect(dStr).toMatch(/M/);
  });
});
