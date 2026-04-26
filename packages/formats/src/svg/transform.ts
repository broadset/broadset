import {
  compose,
  decomposeTSR,
  fromDefinition,
  fromTransformAttribute,
  type Matrix,
} from 'transformation-matrix';

/**
 * P7.7c — Full SVG transform parser. Replaces the rotate+translate-
 * only `parseTransform` from earlier phases with a `transformation-
 * matrix`-backed compose/decompose pipeline that handles every
 * transform variant the SVG 2 spec admits (translate, rotate, scale,
 * skewX, skewY, matrix). Per IO-D-02 Broadset has no element-level
 * scale/skew fields; affines that include those components must
 * convert the shape to a `<path>` and bake the transform into the
 * `d` via `svgpath`. The bake step is owned by callers (path import
 * has the geometry already; rect/ellipse/circle/polygon/polyline
 * convert their canonical outline first).
 */

const RAD_TO_DEG = 180 / Math.PI;
const ROTATE_EPS = 1e-3;
const SCALE_EPS = 1e-3;

export interface DecomposedTransform {
  /** Translation in px. Always populated. */
  readonly tx: number;
  readonly ty: number;
  /** Rotation in degrees clockwise. Always populated. */
  readonly rotation: number;
  /**
   * `true` when the affine carries a non-trivial scale or skew that
   * Broadset cannot represent natively. Callers MUST bake the
   * transform into a `<path>` `d` rather than store the geometry as
   * a native shape.
   */
  readonly requiresBake: boolean;
  /** The composed affine matrix; supplied to `bakeTransformIntoPath`. */
  readonly matrix: Matrix;
}

/**
 * Parse and decompose an SVG `transform=` attribute. Falls back to
 * the identity-like decomposition (zero translate, zero rotate,
 * `requiresBake: false`) when the attribute is empty or malformed.
 */
export function parseAndDecomposeTransform(transformStr: string): DecomposedTransform {
  if (transformStr.trim() === '') {
    return { tx: 0, ty: 0, rotation: 0, requiresBake: false, matrix: identityMatrix() };
  }

  let descriptors;

  try {
    descriptors = fromTransformAttribute(transformStr);
  } catch {
    return { tx: 0, ty: 0, rotation: 0, requiresBake: false, matrix: identityMatrix() };
  }

  if (descriptors.length === 0) {
    return { tx: 0, ty: 0, rotation: 0, requiresBake: false, matrix: identityMatrix() };
  }

  const matrices = descriptors.map((d) => fromDefinition(d));
  const composed = compose(...matrices);
  const tsr = decomposeTSR(composed);
  const tx = tsr.translate.tx;
  const ty = tsr.translate.ty;
  const sx = tsr.scale.sx;
  const sy = tsr.scale.sy;
  const angleRad = tsr.rotation.angle;

  // Guard against NaN / Infinity propagation. A `matrix(1e308,…)`
  // composes finite-but-huge values that overflow on later
  // operations; downstream consumers received `rotation = NaN` from
  // `(NaN + 360) % 360`. Falling back to identity preserves IO-D-18
  // (no silent drops — the document still imports, the transform
  // just no-ops with a warning). Closes the security audit
  // hardening finding.
  if (
    !Number.isFinite(tx) ||
    !Number.isFinite(ty) ||
    !Number.isFinite(sx) ||
    !Number.isFinite(sy) ||
    !Number.isFinite(angleRad)
  ) {
    return { tx: 0, ty: 0, rotation: 0, requiresBake: false, matrix: identityMatrix() };
  }

  const rotation = (angleRad * RAD_TO_DEG + 360) % 360;

  // Detect skew: a pure rotation+translate matrix has its top-left
  // 2x2 equal to [cosθ, -sinθ; sinθ, cosθ] (after factoring scale).
  // `decomposeTSR` returns a TSR that exactly reconstructs the
  // input only when no skew is present; we re-compose and compare.
  const noScale = Math.abs(sx - 1) < SCALE_EPS && Math.abs(sy - 1) < SCALE_EPS;
  const hasSkew = !skewIsZero(composed, tx, ty, angleRad, sx, sy);
  const requiresBake = !noScale || hasSkew;

  return {
    tx,
    ty,
    rotation: Math.abs(rotation) < ROTATE_EPS ? 0 : rotation,
    requiresBake,
    matrix: composed,
  };
}

function identityMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function skewIsZero(m: Matrix, tx: number, ty: number, angleRad: number, sx: number, sy: number): boolean {
  // Reconstruct the matrix from the decomposition and compare to
  // the input. If they match within epsilon, no skew. Otherwise the
  // input had skew and `requiresBake` should fire.
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const expectedA = cos * sx;
  const expectedB = sin * sx;
  const expectedC = -sin * sy;
  const expectedD = cos * sy;
  const matchesA = Math.abs(m.a - expectedA) < SCALE_EPS;
  const matchesB = Math.abs(m.b - expectedB) < SCALE_EPS;
  const matchesC = Math.abs(m.c - expectedC) < SCALE_EPS;
  const matchesD = Math.abs(m.d - expectedD) < SCALE_EPS;
  const matchesE = Math.abs(m.e - tx) < SCALE_EPS;
  const matchesF = Math.abs(m.f - ty) < SCALE_EPS;

  return matchesA && matchesB && matchesC && matchesD && matchesE && matchesF;
}

/**
 * Build a `<rect>` outline as an SVG path d-string (no transform
 * applied yet). The caller bakes the transform via
 * `bakeTransformIntoPathD`.
 */
export function rectAsPathD(width: number, height: number): string {
  const w = String(width);
  const h = String(height);

  return `M0,0 L${w},0 L${w},${h} L0,${h} Z`;
}

/**
 * Build an `<ellipse>` outline as a four-cubic-Bézier path (kappa
 * approximation) so the bake-to-path pipeline can apply scale/skew
 * without losing the curvature.
 */
export function ellipseAsPathD(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5522847498307936;
  const ox = rx * k;
  const oy = ry * k;
  const left = cx - rx;
  const right = cx + rx;
  const top = cy - ry;
  const bottom = cy + ry;

  return [
    `M${String(left)},${String(cy)}`,
    `C${String(left)},${String(cy - oy)} ${String(cx - ox)},${String(top)} ${String(cx)},${String(top)}`,
    `C${String(cx + ox)},${String(top)} ${String(right)},${String(cy - oy)} ${String(right)},${String(cy)}`,
    `C${String(right)},${String(cy + oy)} ${String(cx + ox)},${String(bottom)} ${String(cx)},${String(bottom)}`,
    `C${String(cx - ox)},${String(bottom)} ${String(left)},${String(cy + oy)} ${String(left)},${String(cy)} Z`,
  ].join(' ');
}
