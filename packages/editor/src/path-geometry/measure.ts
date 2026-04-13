import { toAbsoluteSegments } from './normalize';
import type { PathHandle, PathSegment } from './types';

export function extractHandles(segments: readonly PathSegment[]): readonly PathHandle[] {
  const absSegments = toAbsoluteSegments(segments);
  const handles: PathHandle[] = [];

  for (let si = 0; si < absSegments.length; si++) {
    const seg = absSegments[si];

    if (seg === undefined) {
      continue;
    }

    const upperCmd = seg.command.toUpperCase();

    if (upperCmd === 'M' || upperCmd === 'L' || upperCmd === 'T') {
      if (seg.coords.length >= 2) {
        handles.push({
          type: 'anchor',
          x: seg.coords[0] ?? 0,
          y: seg.coords[1] ?? 0,
          segmentIndex: si,
          xIndex: 0,
          yIndex: 1,
        });
      }
    } else if (upperCmd === 'H') {
      if (seg.coords.length >= 1) {
        handles.push({
          type: 'anchor',
          x: seg.coords[0] ?? 0,
          y: Number.NaN,
          segmentIndex: si,
          xIndex: 0,
          yIndex: -1,
        });
      }
    } else if (upperCmd === 'V') {
      if (seg.coords.length >= 1) {
        handles.push({
          type: 'anchor',
          x: Number.NaN,
          y: seg.coords[0] ?? 0,
          segmentIndex: si,
          xIndex: -1,
          yIndex: 0,
        });
      }
    } else if (upperCmd === 'C') {
      if (seg.coords.length >= 6) {
        handles.push(
          { type: 'control', x: seg.coords[0] ?? 0, y: seg.coords[1] ?? 0, segmentIndex: si, xIndex: 0, yIndex: 1 },
          { type: 'control', x: seg.coords[2] ?? 0, y: seg.coords[3] ?? 0, segmentIndex: si, xIndex: 2, yIndex: 3 },
          { type: 'anchor', x: seg.coords[4] ?? 0, y: seg.coords[5] ?? 0, segmentIndex: si, xIndex: 4, yIndex: 5 },
        );
      }
    } else if (upperCmd === 'S' || upperCmd === 'Q') {
      if (seg.coords.length >= 4) {
        handles.push(
          { type: 'control', x: seg.coords[0] ?? 0, y: seg.coords[1] ?? 0, segmentIndex: si, xIndex: 0, yIndex: 1 },
          { type: 'anchor', x: seg.coords[2] ?? 0, y: seg.coords[3] ?? 0, segmentIndex: si, xIndex: 2, yIndex: 3 },
        );
      }
    } else if (upperCmd === 'A') {
      if (seg.coords.length >= 7) {
        handles.push({
          type: 'anchor',
          x: seg.coords[5] ?? 0,
          y: seg.coords[6] ?? 0,
          segmentIndex: si,
          xIndex: 5,
          yIndex: 6,
        });
      }
    }
  }

  return handles;
}

export function computeCoordBounds(
  segments: readonly PathSegment[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const absSegments = toAbsoluteSegments(segments);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const seg of absSegments) {
    const upper = seg.command.toUpperCase();

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      const x = seg.coords[0] ?? 0;
      const y = seg.coords[1] ?? 0;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      found = true;
    } else if (upper === 'H') {
      const x = seg.coords[0] ?? 0;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      found = true;
    } else if (upper === 'V') {
      const y = seg.coords[0] ?? 0;

      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      found = true;
    } else if (upper === 'C') {
      for (let i = 0; i < 6; i += 2) {
        const x = seg.coords[i] ?? 0;
        const y = seg.coords[i + 1] ?? 0;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      found = true;
    } else if (upper === 'S' || upper === 'Q') {
      for (let i = 0; i < 4; i += 2) {
        const x = seg.coords[i] ?? 0;
        const y = seg.coords[i + 1] ?? 0;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      found = true;
    } else if (upper === 'A') {
      const x = seg.coords[5] ?? 0;
      const y = seg.coords[6] ?? 0;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      found = true;
    }
  }

  return found ? { minX, minY, maxX, maxY } : null;
}
