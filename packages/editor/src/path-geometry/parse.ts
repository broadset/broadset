import type { PathSegment } from './types';

const PRECISION = 2;

const COORD_COUNTS: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

function tokenize(d: string): readonly string[] {
  const re = /[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

  return Array.from(d.matchAll(re), (match) => match[0]);
}

export function parsePath(d: string): readonly PathSegment[] {
  const trimmed = d.trim();

  if (trimmed.length === 0) {
    return [];
  }

  const tokens = tokenize(trimmed);
  const segments: PathSegment[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token === undefined) {
      break;
    }

    const upperCmd = token.toUpperCase();

    if (!(upperCmd in COORD_COUNTS)) {
      i++;
      continue;
    }

    const cmd = token;
    const count = COORD_COUNTS[upperCmd] ?? 0;

    i++;

    if (count === 0) {
      segments.push({ command: cmd, coords: [] });
      continue;
    }

    let consumed = false;

    while (i + count <= tokens.length) {
      const peek = tokens[i];

      if (peek === undefined || /^[a-zA-Z]$/.test(peek)) {
        break;
      }

      const coords: number[] = [];

      for (let j = 0; j < count; j++) {
        const numToken = tokens[i + j];

        coords.push(numToken !== undefined ? Number(numToken) : 0);
      }

      i += count;
      consumed = true;
      segments.push({ command: cmd, coords });
    }

    if (!consumed) {
      segments.push({ command: cmd, coords: [] });
    }
  }

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

export function roundPathCoordinate(value: number): number {
  return roundCoord(value);
}
