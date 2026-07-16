import { projectFormatV1 } from '@broadset/model';
import type { BezierKnot, BezierPath, Layer } from 'ag-psd';

import { isRgbaColor } from '../color-utils';
import { PSD_COORD_MAX } from '../constants';
import { mapPsdAppearanceV1 } from './appearance';
import { psdLayerName } from './names';

const MAX_CHANNEL = 255;
const MINIMUM_BOUND = 1;

function layerBounds(layer: Layer): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
} {
  const left = Number.isFinite(layer.left) ? layer.left ?? 0 : 0;
  const top = Number.isFinite(layer.top) ? layer.top ?? 0 : 0;
  const right = Number.isFinite(layer.right) ? layer.right ?? left : left;
  const bottom = Number.isFinite(layer.bottom) ? layer.bottom ?? top : top;

  return {
    left,
    top,
    width: Math.max(MINIMUM_BOUND, right - left),
    height: Math.max(MINIMUM_BOUND, bottom - top),
  };
}

function anchor(knot: BezierKnot, width: number, height: number): readonly [number, number] {
  return [
    ((knot.points[3] ?? 0) / PSD_COORD_MAX) * width,
    ((knot.points[2] ?? 0) / PSD_COORD_MAX) * height,
  ];
}

function preceding(knot: BezierKnot, width: number, height: number): readonly [number, number] {
  return [
    ((knot.points[1] ?? 0) / PSD_COORD_MAX) * width,
    ((knot.points[0] ?? 0) / PSD_COORD_MAX) * height,
  ];
}

function leaving(knot: BezierKnot, width: number, height: number): readonly [number, number] {
  return [
    ((knot.points[5] ?? 0) / PSD_COORD_MAX) * width,
    ((knot.points[4] ?? 0) / PSD_COORD_MAX) * height,
  ];
}

function structuredPath(input: {
  readonly path: BezierPath;
  readonly elementId: projectFormatV1.Id;
  readonly width: number;
  readonly height: number;
}): projectFormatV1.StructuredPath | undefined {
  if (input.path.knots.length < 2) return undefined;

  const points: projectFormatV1.PathPoint[] = input.path.knots.map((knot, index) => {
    const [x, y] = anchor(knot, input.width, input.height);

    return {
      id: projectFormatV1.idSchema.parse(`${input.elementId}-point-${String(index + 1)}`),
      x,
      y,
    };
  });
  const first = points[0];

  if (first === undefined) return undefined;

  const segments: projectFormatV1.PathSegment[] = [{
    id: projectFormatV1.idSchema.parse(`${input.elementId}-segment-1`),
    kind: 'move',
    pointId: first.id,
  }];

  for (let index = 1; index < input.path.knots.length; index += 1) {
    const previousKnot = input.path.knots[index - 1];
    const knot = input.path.knots[index];
    const point = points[index];

    if (previousKnot === undefined || knot === undefined || point === undefined) continue;

    const control1 = leaving(previousKnot, input.width, input.height);
    const control2 = preceding(knot, input.width, input.height);
    const previousAnchor = anchor(previousKnot, input.width, input.height);
    const currentAnchor = anchor(knot, input.width, input.height);
    const straight = control1[0] === previousAnchor[0] && control1[1] === previousAnchor[1] &&
      control2[0] === currentAnchor[0] && control2[1] === currentAnchor[1];
    const id = projectFormatV1.idSchema.parse(`${input.elementId}-segment-${String(index + 1)}`);

    segments.push(straight
      ? { id, kind: 'line', pointId: point.id }
      : { id, kind: 'cubic', control1, control2, pointId: point.id });
  }

  if (!input.path.open) {
    segments.push({
      id: projectFormatV1.idSchema.parse(`${input.elementId}-segment-close`),
      kind: 'close',
    });
  }

  return { points, segments, closed: !input.path.open };
}

function appearance(layer: Layer, elementId: projectFormatV1.Id): projectFormatV1.Appearance {
  const vectorFill = layer.vectorFill;
  const color = vectorFill?.type === 'color' && isRgbaColor(vectorFill.color) ? vectorFill.color : undefined;
  const fills: projectFormatV1.FillLayer[] = color === undefined ? [] : [{
    id: projectFormatV1.idSchema.parse(`${elementId}-fill`),
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
    paint: {
      kind: 'solid',
      color: {
        kind: 'color',
        space: 'srgb',
        channels: [color.r / MAX_CHANNEL, color.g / MAX_CHANNEL, color.b / MAX_CHANNEL],
        alpha: Number.isFinite(color.a) ? color.a : 1,
      },
    },
  }];

  return mapPsdAppearanceV1({ layer, fills });
}

export function mapPsdVectorLayerV1(input: {
  readonly layer: Layer;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id;
}): projectFormatV1.Element | undefined {
  const sourcePath = input.layer.vectorMask?.paths[0];
  const bounds = layerBounds(input.layer);
  const path = sourcePath === undefined ? undefined : structuredPath({
    path: sourcePath,
    elementId: input.elementId,
    width: bounds.width,
    height: bounds.height,
  });

  if (sourcePath === undefined || path === undefined) return undefined;

  return projectFormatV1.createElementV1({
    id: input.elementId,
    name: psdLayerName(input.layer.name, 'PSD vector layer'),
    parentId: input.parentId,
    geometry: projectFormatV1.createElementGeometry({
      width: bounds.width,
      height: bounds.height,
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, bounds.left, bounds.top] },
    }),
    appearance: appearance(input.layer, input.elementId),
    kind: 'vector',
    geometryData: {
      kind: 'path',
      fillRule: sourcePath.fillRule === 'even-odd' ? 'evenodd' : 'nonzero',
      path,
    },
  });
}
