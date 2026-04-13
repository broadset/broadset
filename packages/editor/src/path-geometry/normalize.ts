import { roundPathCoordinate } from './parse';
import type { PathSegment } from './types';

export function toAbsoluteSegments(segments: readonly PathSegment[]): readonly PathSegment[] {
  const result: PathSegment[] = [];
  let penX = 0;
  let penY = 0;
  let startX = 0;
  let startY = 0;

  for (const seg of segments) {
    const isRelative = seg.command !== seg.command.toUpperCase();
    const upper = seg.command.toUpperCase();

    if (!isRelative) {
      result.push({ command: upper, coords: [...seg.coords] });

      if (upper === 'M' || upper === 'L' || upper === 'T') {
        penX = seg.coords[0] ?? 0;
        penY = seg.coords[1] ?? 0;

        if (upper === 'M') {
          startX = penX;
          startY = penY;
        }
      } else if (upper === 'H') {
        penX = seg.coords[0] ?? 0;
      } else if (upper === 'V') {
        penY = seg.coords[0] ?? 0;
      } else if (upper === 'C') {
        penX = seg.coords[4] ?? 0;
        penY = seg.coords[5] ?? 0;
      } else if (upper === 'S' || upper === 'Q') {
        penX = seg.coords[2] ?? 0;
        penY = seg.coords[3] ?? 0;
      } else if (upper === 'A') {
        penX = seg.coords[5] ?? 0;
        penY = seg.coords[6] ?? 0;
      } else if (upper === 'Z') {
        penX = startX;
        penY = startY;
      }

      continue;
    }

    const coords = [...seg.coords];

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      coords[0] = (coords[0] ?? 0) + penX;
      coords[1] = (coords[1] ?? 0) + penY;
      penX = coords[0];
      penY = coords[1];

      if (upper === 'M') {
        startX = penX;
        startY = penY;
      }
    } else if (upper === 'H') {
      coords[0] = (coords[0] ?? 0) + penX;
      penX = coords[0];
    } else if (upper === 'V') {
      coords[0] = (coords[0] ?? 0) + penY;
      penY = coords[0];
    } else if (upper === 'C') {
      coords[0] = (coords[0] ?? 0) + penX;
      coords[1] = (coords[1] ?? 0) + penY;
      coords[2] = (coords[2] ?? 0) + penX;
      coords[3] = (coords[3] ?? 0) + penY;
      coords[4] = (coords[4] ?? 0) + penX;
      coords[5] = (coords[5] ?? 0) + penY;
      penX = coords[4];
      penY = coords[5];
    } else if (upper === 'S' || upper === 'Q') {
      coords[0] = (coords[0] ?? 0) + penX;
      coords[1] = (coords[1] ?? 0) + penY;
      coords[2] = (coords[2] ?? 0) + penX;
      coords[3] = (coords[3] ?? 0) + penY;
      penX = coords[2];
      penY = coords[3];
    } else if (upper === 'A') {
      coords[5] = (coords[5] ?? 0) + penX;
      coords[6] = (coords[6] ?? 0) + penY;
      penX = coords[5];
      penY = coords[6];
    } else if (upper === 'Z') {
      penX = startX;
      penY = startY;
    }

    result.push({ command: upper, coords });
  }

  return result;
}

export function rebaseSegments(
  segments: readonly PathSegment[],
  offsetX: number,
  offsetY: number,
): readonly PathSegment[] {
  const absSegments = toAbsoluteSegments(segments);

  return absSegments.map((seg) => {
    const upper = seg.command.toUpperCase();

    if (upper === 'Z') {
      return seg;
    }

    const coords = [...seg.coords];

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      coords[0] = roundPathCoordinate((coords[0] ?? 0) - offsetX);
      coords[1] = roundPathCoordinate((coords[1] ?? 0) - offsetY);
    } else if (upper === 'H') {
      coords[0] = roundPathCoordinate((coords[0] ?? 0) - offsetX);
    } else if (upper === 'V') {
      coords[0] = roundPathCoordinate((coords[0] ?? 0) - offsetY);
    } else if (upper === 'C') {
      for (let i = 0; i < 6; i += 2) {
        coords[i] = roundPathCoordinate((coords[i] ?? 0) - offsetX);
        coords[i + 1] = roundPathCoordinate((coords[i + 1] ?? 0) - offsetY);
      }
    } else if (upper === 'S' || upper === 'Q') {
      for (let i = 0; i < 4; i += 2) {
        coords[i] = roundPathCoordinate((coords[i] ?? 0) - offsetX);
        coords[i + 1] = roundPathCoordinate((coords[i + 1] ?? 0) - offsetY);
      }
    } else if (upper === 'A') {
      coords[5] = roundPathCoordinate((coords[5] ?? 0) - offsetX);
      coords[6] = roundPathCoordinate((coords[6] ?? 0) - offsetY);
    }

    return { command: seg.command, coords };
  });
}
