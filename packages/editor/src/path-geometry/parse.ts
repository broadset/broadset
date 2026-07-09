import svgpath from 'svgpath';

import type { PathSegment } from './types';

const PRECISION = 2;

export function parsePath(d: string): readonly PathSegment[] {
  if (d.trim().length === 0) {
    return [];
  }

  const segments: PathSegment[] = [];

  svgpath(d).iterate((tuple) => {
    const [command, ...coords] = tuple;

    segments.push({ command, coords });
  });

  return segments;
}

function roundCoord(n: number): number {
  const factor = 10 ** PRECISION;

  return Math.round(n * factor) / factor;
}

export function serializePath(segments: readonly PathSegment[]): string {
  const parts: string[] = [];

  for (const seg of segments) {
    if (seg.coords.length === 0) {
      parts.push(seg.command);
    } else {
      const rounded = seg.coords.map(roundCoord);

      parts.push(`${seg.command} ${rounded.join(' ')}`);
    }
  }

  return parts.join(' ');
}
