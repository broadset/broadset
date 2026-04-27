import type { BezierKnot, BezierPath, Layer } from 'ag-psd';

import { PSD_COORD_MAX } from './constants';

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface Aabb {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface Rotator {
  (px: number, py: number): Point;
}

function readBounds(layer: Layer): Bounds | undefined {
  const left = layer.left;
  const top = layer.top;
  const right = layer.right;
  const bottom = layer.bottom;

  if (left === undefined || top === undefined || right === undefined || bottom === undefined) return undefined;

  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) return undefined;

  return { left, top, width, height };
}

function makeRotator(bounds: Bounds, rotationDeg: number): Rotator {
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  return (px, py) => {
    const dx = px - cx;
    const dy = py - cy;

    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  };
}

/**
 * Knot points are stored as `[prevCtrlY, prevCtrlX, anchorY, anchorX,
 * nextCtrlY, nextCtrlX]` in PSD's row-major (Y-first) convention.
 * Convert each pair through canvas coords, rotate, and return the
 * three rotated canvas points so the AABB pass can enclose them.
 */
function rotateKnot(knot: BezierKnot, bounds: Bounds, rotate: Rotator): readonly Point[] {
  const points: Point[] = [];

  for (let i = 0; i < 6; i += 2) {
    const ny = knot.points[i] ?? 0;
    const nx = knot.points[i + 1] ?? 0;
    const absX = bounds.left + (nx / PSD_COORD_MAX) * bounds.width;
    const absY = bounds.top + (ny / PSD_COORD_MAX) * bounds.height;

    points.push(rotate(absX, absY));
  }

  return points;
}

function computeAabb(rotatedPaths: readonly { readonly rotatedPoints: readonly Point[] }[]): Aabb {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const { rotatedPoints } of rotatedPaths) {
    for (const point of rotatedPoints) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }

  return { minX, minY, maxX, maxY };
}

function reNormaliseKnot(rotatedPoints: readonly Point[], aabb: Aabb, knot: BezierKnot): BezierKnot {
  const newWidth = aabb.maxX - aabb.minX;
  const newHeight = aabb.maxY - aabb.minY;
  const newPoints: number[] = [];

  for (let pairOffset = 0; pairOffset < 3; pairOffset++) {
    const point = rotatedPoints[pairOffset] ?? { x: 0, y: 0 };
    const ny = ((point.y - aabb.minY) / newHeight) * PSD_COORD_MAX;
    const nx = ((point.x - aabb.minX) / newWidth) * PSD_COORD_MAX;

    newPoints.push(ny, nx);
  }

  return { linked: knot.linked, points: newPoints };
}

/**
 * Compose element rotation into the vector-mask path knots and the
 * layer's axis-aligned bounding box. PSD does not store rotation as a
 * first-class layer transform for non-image layers — we encode the
 * rotation by:
 *
 *   1. converting every path knot from its normalised [0, PSD_COORD_MAX]
 *      coordinates into the canvas-relative coordinates the original
 *      bounding box implies,
 *   2. rotating those points around the bounding box centre,
 *   3. computing the axis-aligned bounding box of the rotated points,
 *   4. re-normalising every rotated point against the new bounding box,
 *   5. updating `layer.left/top/right/bottom` to the new AABB.
 *
 * The result reads back in Photoshop as a rotated shape: the layer
 * bounds enclose the rotated geometry tightly, and the vector mask
 * traces the rotated outline. This mirrors what `rotatedQuad` already
 * does for image (`placedLayer`) transforms — a uniform contract
 * across native shape, path, and text layers.
 *
 * No-op when `rotationDeg === 0`, when the layer has no vector mask,
 * or when the layer is missing one of its bounding-box edges.
 */
export function applyRotationToVectorMask(layer: Layer, rotationDeg: number): void {
  if (rotationDeg === 0) return;

  const paths = layer.vectorMask?.paths;

  if (paths === undefined || paths.length === 0) return;

  const bounds = readBounds(layer);

  if (bounds === undefined) return;

  const rotate = makeRotator(bounds, rotationDeg);
  const rotatedPaths = paths.map((path) => ({
    path,
    rotatedKnots: path.knots.map((knot) => rotateKnot(knot, bounds, rotate)),
  }));
  const rotatedPathPoints = rotatedPaths.map(({ rotatedKnots }) => ({
    rotatedPoints: rotatedKnots.flat(),
  }));
  const aabb = computeAabb(rotatedPathPoints);

  if (aabb.maxX - aabb.minX <= 0 || aabb.maxY - aabb.minY <= 0) return;

  const reNormalisedPaths: BezierPath[] = rotatedPaths.map(({ path, rotatedKnots }) => ({
    open: path.open,
    knots: path.knots.map((knot, knotIndex) => reNormaliseKnot(rotatedKnots[knotIndex] ?? [], aabb, knot)),
    fillRule: path.fillRule,
  }));

  layer.left = Math.round(aabb.minX);
  layer.top = Math.round(aabb.minY);
  layer.right = Math.round(aabb.maxX);
  layer.bottom = Math.round(aabb.maxY);
  layer.vectorMask = { paths: reNormalisedPaths };
}
