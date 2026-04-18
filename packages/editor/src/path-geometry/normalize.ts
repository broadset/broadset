import svgpath from 'svgpath';

import { serializePath } from './parse';
import type { PathSegment } from './types';

export function toAbsoluteSegments(segments: readonly PathSegment[]): readonly PathSegment[] {
  if (segments.length === 0) {
    return [];
  }

  const result: PathSegment[] = [];

  svgpath(serializePath(segments))
    .abs()
    .iterate((tuple) => {
      const [command, ...coords] = tuple;

      result.push({ command, coords });
    });

  return result;
}
