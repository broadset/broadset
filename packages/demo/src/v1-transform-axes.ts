import type { projectFormatV1 } from '@broadset/model';

const DEGREES_PER_HALF_TURN = 180;
const GIMBAL_EPSILON = 1e-9;

interface V1TransformAxes {
  readonly rotateX: number;
  readonly rotateY: number;
  readonly rotateZ: number;
  readonly translateZ: number;
}

interface V1TransformComponents extends V1TransformAxes {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  readonly translateX: number;
  readonly translateY: number;
}

function radiansToDegrees(value: number): number {
  return (value * DEGREES_PER_HALF_TURN) / Math.PI;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / DEGREES_PER_HALF_TURN;
}

function nonzeroScale(value: number): number {
  return value > GIMBAL_EPSILON ? value : 1;
}

function readAffineComponents(
  transform: Extract<projectFormatV1.ElementTransform, { readonly kind: 'affine2d' }>,
): V1TransformComponents {
  const [a, b, c, d, translateX, translateY] = transform.matrix;

  return {
    rotateX: 0,
    rotateY: 0,
    rotateZ: radiansToDegrees(Math.atan2(b, a)),
    scaleX: nonzeroScale(Math.hypot(a, b)),
    scaleY: nonzeroScale(Math.hypot(c, d)),
    scaleZ: 1,
    translateX,
    translateY,
    translateZ: 0,
  };
}

function readMatrix3dComponents(
  transform: Extract<projectFormatV1.ElementTransform, { readonly kind: 'matrix3d' }>,
): V1TransformComponents {
  const matrix = transform.matrix;
  const scaleX = nonzeroScale(Math.hypot(matrix[0], matrix[1], matrix[2]));
  const scaleY = nonzeroScale(Math.hypot(matrix[4], matrix[5], matrix[6]));
  const scaleZ = nonzeroScale(Math.hypot(matrix[8], matrix[9], matrix[10]));
  const row20 = matrix[2] / scaleX;
  const rotateY = Math.asin(Math.max(-1, Math.min(1, -row20)));
  const cosineY = Math.cos(rotateY);
  const rotateX = Math.abs(cosineY) > GIMBAL_EPSILON ? Math.atan2(matrix[6] / scaleY, matrix[10] / scaleZ) : 0;
  const rotateZ = Math.abs(cosineY) > GIMBAL_EPSILON ? Math.atan2(matrix[1] / scaleX, matrix[0] / scaleX) : 0;

  return {
    rotateX: radiansToDegrees(rotateX),
    rotateY: radiansToDegrees(rotateY),
    rotateZ: radiansToDegrees(rotateZ),
    scaleX,
    scaleY,
    scaleZ,
    translateX: matrix[12],
    translateY: matrix[13],
    translateZ: matrix[14],
  };
}

function readComponents(transform: projectFormatV1.ElementTransform): V1TransformComponents {
  return transform.kind === 'affine2d' ? readAffineComponents(transform) : readMatrix3dComponents(transform);
}

export function readV1TransformAxes(transform: projectFormatV1.ElementTransform): V1TransformAxes {
  const components = readComponents(transform);

  return {
    rotateX: components.rotateX,
    rotateY: components.rotateY,
    rotateZ: components.rotateZ,
    translateZ: components.translateZ,
  };
}

function composeMatrix3d(components: V1TransformComponents): projectFormatV1.ElementTransform {
  const x = degreesToRadians(components.rotateX);
  const y = degreesToRadians(components.rotateY);
  const z = degreesToRadians(components.rotateZ);
  const cosineX = Math.cos(x);
  const sineX = Math.sin(x);
  const cosineY = Math.cos(y);
  const sineY = Math.sin(y);
  const cosineZ = Math.cos(z);
  const sineZ = Math.sin(z);

  return {
    kind: 'matrix3d',
    matrix: [
      cosineZ * cosineY * components.scaleX,
      sineZ * cosineY * components.scaleX,
      -sineY * components.scaleX,
      0,
      (cosineZ * sineY * sineX - sineZ * cosineX) * components.scaleY,
      (sineZ * sineY * sineX + cosineZ * cosineX) * components.scaleY,
      cosineY * sineX * components.scaleY,
      0,
      (cosineZ * sineY * cosineX + sineZ * sineX) * components.scaleZ,
      (sineZ * sineY * cosineX - cosineZ * sineX) * components.scaleZ,
      cosineY * cosineX * components.scaleZ,
      0,
      components.translateX,
      components.translateY,
      components.translateZ,
      1,
    ],
  };
}

export function updateV1TransformAxis(options: {
  readonly transform: projectFormatV1.ElementTransform;
  readonly axis: 'rotateX' | 'rotateY' | 'rotateZ' | 'translateZ';
  readonly value: number;
}): projectFormatV1.ElementTransform {
  const components = readComponents(options.transform);

  return composeMatrix3d({ ...components, [options.axis]: options.value });
}
