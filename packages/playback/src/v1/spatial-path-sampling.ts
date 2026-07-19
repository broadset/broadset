import type { projectFormatV1 } from '@broadset/model';

interface SpatialPathSampleV1 {
  readonly point: readonly [number, number];
  readonly orientationRadians: number;
}

interface FlatPoint {
  readonly x: number;
  readonly y: number;
}

interface FlatSegment {
  readonly start: FlatPoint;
  readonly end: FlatPoint;
}

function evaluateCurve(options: {
  readonly start: FlatPoint;
  readonly end: FlatPoint;
  readonly control1?: readonly [number, number] | undefined;
  readonly control2?: readonly [number, number] | undefined;
  readonly progress: number;
}): FlatPoint {
  const t = options.progress;
  const inverse = 1 - t;

  if (options.control1 === undefined) return { x: options.start.x * inverse + options.end.x * t, y: options.start.y * inverse + options.end.y * t };

  if (options.control2 === undefined) {
    return {
      x: inverse * inverse * options.start.x + 2 * inverse * t * options.control1[0] + t * t * options.end.x,
      y: inverse * inverse * options.start.y + 2 * inverse * t * options.control1[1] + t * t * options.end.y,
    };
  }

  return {
    x: inverse ** 3 * options.start.x + 3 * inverse * inverse * t * options.control1[0] + 3 * inverse * t * t * options.control2[0] + t ** 3 * options.end.x,
    y: inverse ** 3 * options.start.y + 3 * inverse * inverse * t * options.control1[1] + 3 * inverse * t * t * options.control2[1] + t ** 3 * options.end.y,
  };
}

function appendCurve(options: {
  readonly segment: Exclude<projectFormatV1.PathSegment, { readonly kind: 'close' | 'move' }>;
  readonly start: FlatPoint;
  readonly end: FlatPoint;
  readonly output: FlatSegment[];
}): void {
  const steps = options.segment.kind === 'line' ? 1 : 32;
  let cursor = options.start;

  for (let step = 1; step <= steps; step += 1) {
    const end = evaluateCurve({
      start: options.start,
      end: options.end,
      ...(options.segment.kind === 'quadratic' ? { control1: options.segment.control } : {}),
      ...(options.segment.kind === 'cubic' ? { control1: options.segment.control1, control2: options.segment.control2 } : {}),
      progress: step / steps,
    });

    options.output.push({ start: cursor, end });
    cursor = end;
  }
}

function appendClosingSegment(output: FlatSegment[], current: FlatPoint | undefined, subpathStart: FlatPoint | undefined): void {
  if (current === undefined || subpathStart === undefined || (current.x === subpathStart.x && current.y === subpathStart.y)) return;

  output.push({ start: current, end: subpathStart });
}

function flattenPath(path: projectFormatV1.StructuredPath): readonly FlatSegment[] {
  const pointMap = new Map(path.points.map((point) => [point.id, point]));
  const output: FlatSegment[] = [];
  let current: FlatPoint | undefined;
  let subpathStart: FlatPoint | undefined;

  for (const segment of path.segments) {
    if (segment.kind === 'close') {
      appendClosingSegment(output, current, subpathStart);
      current = subpathStart;
      continue;
    }

    const end = pointMap.get(segment.pointId);

    if (end === undefined) continue;

    if (segment.kind === 'move' || current === undefined) {
      current = end;
      subpathStart = end;
      continue;
    }

    appendCurve({ segment, start: current, end, output });
    current = end;
  }

  if (path.closed) appendClosingSegment(output, current, subpathStart);

  return output;
}

export function sampleSpatialPathV1(options: {
  readonly path: projectFormatV1.StructuredPath;
  readonly progress: number;
}): SpatialPathSampleV1 | undefined {
  if (!Number.isFinite(options.progress) || options.progress < 0 || options.progress > 1) return undefined;

  const segments = flattenPath(options.path);
  const first = options.path.segments.find((segment) => segment.kind === 'move');
  const firstPoint = first?.kind === 'move' ? options.path.points.find((point) => point.id === first.pointId) : undefined;

  if (segments.length === 0) return firstPoint === undefined ? undefined : { point: [firstPoint.x, firstPoint.y], orientationRadians: 0 };

  const lengths = segments.map(({ start, end }) => Math.hypot(end.x - start.x, end.y - start.y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * options.progress;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const length = lengths[index] ?? 0;

    if (segment === undefined) continue;

    if (remaining <= length || index === segments.length - 1) {
      const local = length === 0 ? 0 : Math.min(1, remaining / length);

      return {
        point: [segment.start.x + (segment.end.x - segment.start.x) * local, segment.start.y + (segment.end.y - segment.start.y) * local],
        orientationRadians: Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x),
      };
    }

    remaining -= length;
  }

  return undefined;
}
