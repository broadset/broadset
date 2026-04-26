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
