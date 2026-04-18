import { svgPathBbox } from 'svg-path-bbox';
import svgpath from 'svgpath';

import type { RefitPathBoundsFromSvgInput, RefitPathBoundsInput, RefitPathBoundsResult } from './types';

const REBASE_PRECISION = 2;

function rebasePath(pathData: string, offsetX: number, offsetY: number): string {
  return svgpath(pathData).abs().translate(-offsetX, -offsetY).round(REBASE_PRECISION).toString();
}

export function refitPathBounds(input: RefitPathBoundsInput): RefitPathBoundsResult {
  if (input.pathData.trim() === '') {
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

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + input.strokeWidth,
    height: maxY - minY + input.strokeWidth,
    pathData: rebasePath(input.pathData, minX, minY),
  };
}

export function refitPathBoundsFromSvg(input: RefitPathBoundsFromSvgInput): RefitPathBoundsResult {
  const padding = input.strokeWidth / 2;
  const { svgBBox } = input;

  return {
    x: svgBBox.x - padding,
    y: svgBBox.y - padding,
    width: svgBBox.width + input.strokeWidth,
    height: svgBBox.height + input.strokeWidth,
    pathData: rebasePath(input.pathData, svgBBox.x, svgBBox.y),
  };
}
