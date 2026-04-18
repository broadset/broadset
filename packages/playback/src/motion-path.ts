import { svgPathProperties } from 'svg-path-properties';

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface MotionSample extends Point {
  readonly angleDegrees: number;
}

const ZERO_SAMPLE: MotionSample = { x: 0, y: 0, angleDegrees: 0 };
const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * Samples an SVG motion path by arc length so timeline playback can map
 * normalized progress to stable x/y coordinates and tangent rotation.
 *
 * Delegates parsing and sampling to svg-path-properties, which handles all
 * SVG path commands (including elliptic arcs) and uses analytic segment math
 * rather than uniform-t tessellation.
 */
export function sampleMotionPath(pathData: string, progress: number): MotionSample {
  if (pathData.trim() === '') {
    return ZERO_SAMPLE;
  }

  const properties = new svgPathProperties(pathData);
  const totalLength = properties.getTotalLength();

  if (totalLength <= 0) {
    const start = properties.getPointAtLength(0);

    return { x: start.x, y: start.y, angleDegrees: 0 };
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const { x, y, tangentX, tangentY } = properties.getPropertiesAtLength(totalLength * clampedProgress);
  const angleDegrees = Math.atan2(tangentY, tangentX) * DEGREES_PER_RADIAN;

  return { x, y, angleDegrees };
}
