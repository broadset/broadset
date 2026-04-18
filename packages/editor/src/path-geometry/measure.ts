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
