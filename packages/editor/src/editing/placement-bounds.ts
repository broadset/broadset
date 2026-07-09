import { type PluginDefaults } from '../element-defaults';

const COORDINATE_PRECISION = 2;

export interface PlacementPoint {
  readonly x: number;
  readonly y: number;
}

export interface PlacementBounds {
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

export type PlacementMode = 'corner' | 'ellipse' | 'path' | 'plugin-single-click';

const CORNER_TYPES: ReadonlySet<string> = new Set([
  'rectangle',
  'image',
  'svg',
  'video',
  'qrcode',
  'clock',
  'ticker',
  'group',
  'text',
]);

const ELLIPSE_TYPE = 'ellipse';
const PATH_TYPE = 'path';

/**
 * Returns the placement mode for a given element type. Built-in corner and
 * ellipse/path types are handled directly; any type that matches a plugin
 * registration falls back to plugin single-click placement.
 */
export function resolvePlacementMode(elementType: string, plugins: readonly PluginDefaults[] = []): PlacementMode {
  if (CORNER_TYPES.has(elementType)) {
    return 'corner';
  }

  if (elementType === ELLIPSE_TYPE) {
    return 'ellipse';
  }

  if (elementType === PATH_TYPE) {
    return 'path';
  }

  const isPluginType = plugins.some((plugin) => plugin.type === elementType);

  if (isPluginType) {
    return 'plugin-single-click';
  }

  return 'corner';
}

function roundCoordinate(value: number): number {
  const precisionFactor = 10 ** COORDINATE_PRECISION;

  return Math.round(value * precisionFactor) / precisionFactor;
}

/**
 * Normalise a corner drag so the resulting rectangle has a positive width and
 * height regardless of the direction the user dragged in.
 */
export function resolveCornerBounds(anchor: PlacementPoint, extent: PlacementPoint): PlacementBounds {
  const x = Math.min(anchor.x, extent.x);
  const y = Math.min(anchor.y, extent.y);
  const width = Math.abs(extent.x - anchor.x);
  const height = Math.abs(extent.y - anchor.y);

  return {
    position: { x: roundCoordinate(x), y: roundCoordinate(y) },
    width: roundCoordinate(width),
    height: roundCoordinate(height),
    rotation: 0,
  };
}

/**
 * Ellipse phase 2: component-wise deltas define the axis-aligned radii. The
 * element's axis-aligned bounding box is centred on the anchor.
 */
export function resolveEllipseBounds(
  anchor: PlacementPoint,
  radiusPoint: PlacementPoint,
  rotationPoint: PlacementPoint | null,
): PlacementBounds {
  const rx = Math.abs(radiusPoint.x - anchor.x);
  const ry = Math.abs(radiusPoint.y - anchor.y);
  const rotationDegrees =
    rotationPoint === null ? 0 : (
      (Math.atan2(rotationPoint.y - anchor.y, rotationPoint.x - anchor.x) * 180) / Math.PI
    );

  return {
    position: {
      x: roundCoordinate(anchor.x - rx),
      y: roundCoordinate(anchor.y - ry),
    },
    width: roundCoordinate(rx * 2),
    height: roundCoordinate(ry * 2),
    rotation: roundCoordinate(rotationDegrees),
  };
}

/**
 * Plugin single-click placement: the plugin's declared default size is centred
 * visually by the plugin's own anchoring rules — this resolver places the
 * top-left at the click point so the caller can decide.
 */
export function resolvePluginSingleClickBounds(click: PlacementPoint, width: number, height: number): PlacementBounds {
  return {
    position: { x: roundCoordinate(click.x), y: roundCoordinate(click.y) },
    width,
    height,
    rotation: 0,
  };
}

/**
 * `true` when two placement points are effectively identical — used to ignore
 * degenerate clicks that would produce a zero-size element.
 */
export function isSamePlacementPoint(a: PlacementPoint, b: PlacementPoint): boolean {
  return roundCoordinate(a.x) === roundCoordinate(b.x) && roundCoordinate(a.y) === roundCoordinate(b.y);
}
