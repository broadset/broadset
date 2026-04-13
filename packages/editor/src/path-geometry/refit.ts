import { computeCoordBounds } from './measure';
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

  const bounds = computeCoordBounds(segments);

  if (bounds === null) {
    return {
      x: input.currentX,
      y: input.currentY,
      width: input.currentWidth,
      height: input.currentHeight,
      pathData: input.pathData,
    };
  }

  const padding = input.strokeWidth / 2;

  const x = bounds.minX - padding;
  const y = bounds.minY - padding;
  const width = bounds.maxX - bounds.minX + input.strokeWidth;
  const height = bounds.maxY - bounds.minY + input.strokeWidth;

  const rebased = rebaseSegments(segments, bounds.minX, bounds.minY);
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
