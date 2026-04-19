import { toAbsoluteSegments } from './normalize';
import type { PathHandle, PathSegment } from './types';

function makeAnchor(
  coords: readonly number[],
  segmentIndex: number,
  xIndex: number,
  yIndex: number,
): PathHandle {
  return {
    type: 'anchor',
    x: coords[xIndex] ?? 0,
    y: coords[yIndex] ?? 0,
    segmentIndex,
    xIndex,
    yIndex,
  };
}

function makeControl(
  coords: readonly number[],
  segmentIndex: number,
  xIndex: number,
  yIndex: number,
): PathHandle {
  return {
    type: 'control',
    x: coords[xIndex] ?? 0,
    y: coords[yIndex] ?? 0,
    segmentIndex,
    xIndex,
    yIndex,
  };
}

type HandleBuilder = (segment: PathSegment, segmentIndex: number) => readonly PathHandle[];

const HANDLE_BUILDERS: Readonly<Record<string, HandleBuilder>> = {
  M: (seg, si) => (seg.coords.length >= 2 ? [makeAnchor(seg.coords, si, 0, 1)] : []),
  L: (seg, si) => (seg.coords.length >= 2 ? [makeAnchor(seg.coords, si, 0, 1)] : []),
  T: (seg, si) => (seg.coords.length >= 2 ? [makeAnchor(seg.coords, si, 0, 1)] : []),
  H: (seg, si) =>
    seg.coords.length >= 1
      ? [{ type: 'anchor', x: seg.coords[0] ?? 0, y: Number.NaN, segmentIndex: si, xIndex: 0, yIndex: -1 }]
      : [],
  V: (seg, si) =>
    seg.coords.length >= 1
      ? [{ type: 'anchor', x: Number.NaN, y: seg.coords[0] ?? 0, segmentIndex: si, xIndex: -1, yIndex: 0 }]
      : [],
  C: (seg, si) =>
    seg.coords.length >= 6
      ? [
          makeControl(seg.coords, si, 0, 1),
          makeControl(seg.coords, si, 2, 3),
          makeAnchor(seg.coords, si, 4, 5),
        ]
      : [],
  S: (seg, si) =>
    seg.coords.length >= 4 ? [makeControl(seg.coords, si, 0, 1), makeAnchor(seg.coords, si, 2, 3)] : [],
  Q: (seg, si) =>
    seg.coords.length >= 4 ? [makeControl(seg.coords, si, 0, 1), makeAnchor(seg.coords, si, 2, 3)] : [],
  A: (seg, si) => (seg.coords.length >= 7 ? [makeAnchor(seg.coords, si, 5, 6)] : []),
};

export function extractHandles(segments: readonly PathSegment[]): readonly PathHandle[] {
  return toAbsoluteSegments(segments).flatMap((seg, si) => {
    const builder = HANDLE_BUILDERS[seg.command.toUpperCase()];

    return builder ? builder(seg, si) : [];
  });
}
