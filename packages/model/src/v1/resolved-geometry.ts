import type { ElementGeometry, ElementTransform } from './element';
import type { ResolvedWorldGeometryV1 } from './resolved-scene-types';

type Matrix3d = Extract<ElementTransform, { readonly kind: 'matrix3d' }>['matrix'];

function affineToMatrix3d(transform: Extract<ElementTransform, { readonly kind: 'affine2d' }>): Matrix3d {
  const [a, b, c, d, e, f] = transform.matrix;

  return [a, b, 0, 0, c, d, 0, 0, 0, 0, 1, 0, e, f, 0, 1];
}

function asMatrix3d(transform: ElementTransform): Matrix3d {
  return transform.kind === 'matrix3d' ? transform.matrix : affineToMatrix3d(transform);
}

function multiplyMatrix3d(left: Matrix3d, right: Matrix3d): Matrix3d {
  const entry = (matrix: Matrix3d, index: number): number => {
    const result = matrix[index];

    if (result === undefined) throw new RangeError(`Matrix index ${String(index)} is out of bounds`);

    return result;
  };
  const value = (column: number, row: number): number =>
    entry(left, row) * entry(right, column * 4) +
    entry(left, 4 + row) * entry(right, column * 4 + 1) +
    entry(left, 8 + row) * entry(right, column * 4 + 2) +
    entry(left, 12 + row) * entry(right, column * 4 + 3);

  return [
    value(0, 0),
    value(0, 1),
    value(0, 2),
    value(0, 3),
    value(1, 0),
    value(1, 1),
    value(1, 2),
    value(1, 3),
    value(2, 0),
    value(2, 1),
    value(2, 2),
    value(2, 3),
    value(3, 0),
    value(3, 1),
    value(3, 2),
    value(3, 3),
  ];
}

export function composeElementTransformsV1(parent: ElementTransform, local: ElementTransform): ElementTransform {
  if (parent.kind === 'affine2d' && local.kind === 'affine2d') {
    const [pa, pb, pc, pd, pe, pf] = parent.matrix;
    const [la, lb, lc, ld, le, lf] = local.matrix;

    return {
      kind: 'affine2d',
      matrix: [
        pa * la + pc * lb,
        pb * la + pd * lb,
        pa * lc + pc * ld,
        pb * lc + pd * ld,
        pa * le + pc * lf + pe,
        pb * le + pd * lf + pf,
      ],
    };
  }

  return { kind: 'matrix3d', matrix: multiplyMatrix3d(asMatrix3d(parent), asMatrix3d(local)) };
}

function cloneTransform(transform: ElementTransform): ElementTransform {
  if (transform.kind === 'affine2d') {
    const [a, b, c, d, e, f] = transform.matrix;

    return { kind: 'affine2d', matrix: [a, b, c, d, e, f] };
  }

  const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15] = transform.matrix;

  return { kind: 'matrix3d', matrix: [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15] };
}

export function resolveWorldGeometryV1(
  local: ElementGeometry,
  parentTransform?: ElementTransform,
): ResolvedWorldGeometryV1 {
  const transform =
    parentTransform === undefined ?
      cloneTransform(local.transform)
    : composeElementTransformsV1(parentTransform, local.transform);

  return {
    bounds: { width: local.bounds.width, height: local.bounds.height },
    origin: [local.origin[0], local.origin[1], local.origin[2]],
    transform,
  };
}
