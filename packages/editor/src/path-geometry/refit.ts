import { svgPathBbox } from 'svg-path-bbox';

import { rebaseSegments } from './normalize';
import { parsePath, serializePath } from './parse';
import type { RefitPathBoundsFromSvgInput, RefitPathBoundsInput, RefitPathBoundsResult } from './types';

export function refitPathBounds(input: RefitPathBoundsInput): RefitPathBoundsResult {
  const segments = parsePath(input.pathData);

  if (segments.length === 0) {
    return {
      x: input.currentX,
      y: input.currentY,
      width: input.currentWidth,
      height: input.currentHeight,
      pathData: input.pathData,
    };
  }

  const [minX, minY, maxX, maxY] = svgPathBbox(input.pathData);

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return {
      x: input.currentX,
      y: input.currentY,
      width: input.currentWidth,
      height: input.currentHeight,
      pathData: input.pathData,
    };
  }

  const padding = input.strokeWidth / 2;

  const x = minX - padding;
  const y = minY - padding;
  const width = maxX - minX + input.strokeWidth;
  const height = maxY - minY + input.strokeWidth;

  const rebased = rebaseSegments(segments, minX, minY);
  const pathData = serializePath(rebased);

  return { x, y, width, height, pathData };
}

export function refitPathBoundsFromSvg(input: RefitPathBoundsFromSvgInput): RefitPathBoundsResult {
  const segments = parsePath(input.pathData);
  const padding = input.strokeWidth / 2;
  const { svgBBox } = input;

  const x = svgBBox.x - padding;
  const y = svgBBox.y - padding;
  const width = svgBBox.width + input.strokeWidth;
  const height = svgBBox.height + input.strokeWidth;

  const rebased = rebaseSegments(segments, svgBBox.x, svgBBox.y);
  const pathData = serializePath(rebased);

  return { x, y, width, height, pathData };
}
