import type { projectFormatV1 } from '@broadset/model';

const DEGREES_PER_HALF_TURN = 180;

export interface EditorElementRectV1 {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

export interface EditorElementRectUpdateV1 {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
}

function radiansToDegrees(radians: number): number {
  return (radians * DEGREES_PER_HALF_TURN) / Math.PI;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / DEGREES_PER_HALF_TURN;
}

function getTransformRotation(transform: projectFormatV1.ElementTransform): number {
  if (transform.kind === 'matrix3d') return radiansToDegrees(Math.atan2(transform.matrix[1], transform.matrix[0]));

  const [a, b, c, d] = transform.matrix;
  const firstAxisLength = Math.hypot(a, b);

  return radiansToDegrees(firstAxisLength > 0 ? Math.atan2(b, a) : Math.atan2(-c, d));
}

function getTransformPosition(transform: projectFormatV1.ElementTransform): readonly [number, number] {
  return transform.kind === 'affine2d'
    ? [transform.matrix[4], transform.matrix[5]]
    : [transform.matrix[12], transform.matrix[13]];
}

/** Projects canonical v1 bounds and matrix fields into the editor's rect interaction vocabulary. */
export function getEditorElementRectV1(element: projectFormatV1.Element): EditorElementRectV1 {
  const [x, y] = getTransformPosition(element.geometry.transform);

  return {
    x,
    y,
    width: element.geometry.bounds.width,
    height: element.geometry.bounds.height,
    rotation: getTransformRotation(element.geometry.transform),
  };
}

function rotatePair(x: number, y: number, deltaRadians: number): readonly [number, number] {
  const cosine = Math.cos(deltaRadians);
  const sine = Math.sin(deltaRadians);

  return [cosine * x - sine * y, sine * x + cosine * y];
}

function updateAffineTransform(options: {
  readonly transform: Extract<projectFormatV1.ElementTransform, { readonly kind: 'affine2d' }>;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}): projectFormatV1.ElementTransform {
  const [a, b, c, d] = options.transform.matrix;
  const deltaRadians = degreesToRadians(options.rotation - getTransformRotation(options.transform));
  const [nextA, nextB] = rotatePair(a, b, deltaRadians);
  const [nextC, nextD] = rotatePair(c, d, deltaRadians);

  return { kind: 'affine2d', matrix: [nextA, nextB, nextC, nextD, options.x, options.y] };
}

function updateMatrix3dTransform(options: {
  readonly transform: Extract<projectFormatV1.ElementTransform, { readonly kind: 'matrix3d' }>;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}): projectFormatV1.ElementTransform {
  const matrix = options.transform.matrix;
  const deltaRadians = degreesToRadians(options.rotation - getTransformRotation(options.transform));
  const [m0, m1] = rotatePair(matrix[0], matrix[1], deltaRadians);
  const [m4, m5] = rotatePair(matrix[4], matrix[5], deltaRadians);
  const [m8, m9] = rotatePair(matrix[8], matrix[9], deltaRadians);

  return {
    kind: 'matrix3d',
    matrix: [
      m0,
      m1,
      matrix[2],
      matrix[3],
      m4,
      m5,
      matrix[6],
      matrix[7],
      m8,
      m9,
      matrix[10],
      matrix[11],
      options.x,
      options.y,
      matrix[14],
      matrix[15],
    ],
  };
}

function finiteOrCurrent(candidate: number | undefined, current: number): number {
  return candidate !== undefined && Number.isFinite(candidate) ? candidate : current;
}

function positiveOrCurrent(candidate: number | undefined, current: number): number {
  return candidate !== undefined && Number.isFinite(candidate) && candidate > 0 ? candidate : current;
}

/** Applies editor rect changes back to the canonical matrix without discarding scale, skew, reflection, or 3D fields. */
export function updateElementRectV1(
  element: projectFormatV1.Element,
  update: EditorElementRectUpdateV1,
): projectFormatV1.Element {
  const current = getEditorElementRectV1(element);
  const next: EditorElementRectV1 = {
    x: finiteOrCurrent(update.x, current.x),
    y: finiteOrCurrent(update.y, current.y),
    width: positiveOrCurrent(update.width, current.width),
    height: positiveOrCurrent(update.height, current.height),
    rotation: finiteOrCurrent(update.rotation, current.rotation),
  };

  if (
    next.x === current.x &&
    next.y === current.y &&
    next.width === current.width &&
    next.height === current.height &&
    next.rotation === current.rotation
  ) {
    return element;
  }

  const transform =
    element.geometry.transform.kind === 'affine2d'
      ? updateAffineTransform({ transform: element.geometry.transform, ...next })
      : updateMatrix3dTransform({ transform: element.geometry.transform, ...next });

  return {
    ...element,
    geometry: {
      ...element.geometry,
      bounds: { width: next.width, height: next.height },
      transform,
    },
  };
}
