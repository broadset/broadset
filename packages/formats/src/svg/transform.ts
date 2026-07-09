import {
  compose,
  decomposeTSR,
  fromDefinition,
  fromTransformAttribute,
  type Matrix,
  type MatrixDescriptor,
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

  let descriptors: MatrixDescriptor[];

  try {
    descriptors = fromTransformAttribute(transformStr);
  } catch {
    return { tx: 0, ty: 0, rotation: 0, requiresBake: false, matrix: identityMatrix() };
  }

  if (descriptors.length === 0) {
    return { tx: 0, ty: 0, rotation: 0, requiresBake: false, matrix: identityMatrix() };
  }

  const matrices: Matrix[] = [];

  for (const descriptor of descriptors) {
    matrices.push(fromDefinition(descriptor));
  }

  const composed = compose(...matrices);

  return decomposeMatrix(composed);
}

/**
 * Decompose an arbitrary affine matrix into the Broadset
 * `DecomposedTransform` shape. Used both by
 * `parseAndDecomposeTransform` (after parsing the source SVG
 * transform attribute) and by `combineTransform` (after composing
 * an inherited cumulative matrix with a new descriptor) so the
 * NaN-guard + skew-detection logic stays in a single place. Closes
 * the P7.7 review finding that the additive fast-path dropped the
 * cumulative matrix when a later descendant baked.
 */
export function decomposeMatrix(composed: Matrix): DecomposedTransform {
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
  // just no-ops with a warning).
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
 * Build a `<rect>` outline as an SVG path d-string at the source
 * `(x, y)` corner. The caller bakes the transform via
 * `bakeTransformIntoPathD`. Honouring `x` / `y` is required because
 * SVG `<rect x="50" y="30">` carries the offset on the element, NOT
 * via a wrapping `transform=`.
 */
export function rectAsPathD(x: number, y: number, width: number, height: number): string {
  const x0 = String(x);
  const y0 = String(y);
  const x1 = String(x + width);
  const y1 = String(y + height);

  return `M${x0},${y0} L${x1},${y0} L${x1},${y1} L${x0},${y1} Z`;
}

/**
 * Build a `<polygon>` outline as an SVG path d-string. Points
 * format follows SVG 2 (whitespace- or comma-separated `x,y`
 * pairs). Empty / malformed point lists return `''`.
 */
export function polygonAsPathD(pointsAttr: string, closed: boolean): string {
  const numbers: number[] = [];

  for (const token of pointsAttr.split(/[\s,]+/)) {
    if (token === '') continue;

    const n = parseFloat(token);

    if (Number.isFinite(n)) numbers.push(n);
  }

  if (numbers.length < 4 || numbers.length % 2 !== 0) {
    return '';
  }

  const parts: string[] = [];

  for (let i = 0; i < numbers.length; i += 2) {
    const cmd = i === 0 ? 'M' : 'L';

    parts.push(`${cmd}${String(numbers[i] ?? 0)},${String(numbers[i + 1] ?? 0)}`);
  }

  if (closed) parts.push('Z');

  return parts.join(' ');
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
