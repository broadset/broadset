import { projectFormatV1 } from '@broadset/model';
import svgpath from 'svgpath';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function endpoint(input: {
  readonly command: string;
  readonly values: readonly number[];
  readonly currentX: number;
  readonly currentY: number;
}): readonly [number | undefined, number | undefined] {
  if (input.command === 'H') return [input.values[0], input.currentY];
  if (input.command === 'V') return [input.currentX, input.values[0]];

  return [input.values.at(-2), input.values.at(-1)];
}

export function mapSvgPathV1(input: {
  readonly d: string;
  readonly elementId: projectFormatV1.Id;
}): projectFormatV1.StructuredPath {
  const points: projectFormatV1.PathPoint[] = [];
  const segments: projectFormatV1.PathSegment[] = [];
  let pointSequence = 0;
  let segmentSequence = 0;
  let closed = false;
  let currentX = 0;
  let currentY = 0;
  let subpathX = 0;
  let subpathY = 0;

  if (input.d.trim() === '') return { points, segments, closed };

  svgpath(input.d)
    .abs()
    .unarc()
    .unshort()
    .iterate((tuple) => {
      const [command, ...values] = tuple;

      segmentSequence += 1;

      const segmentId = id(`${input.elementId}-segment-${String(segmentSequence)}`);

      if (command === 'Z') {
        closed = true;
        segments.push({ id: segmentId, kind: 'close' });
        currentX = subpathX;
        currentY = subpathY;

        return;
      }

      const [x, y] = endpoint({ command, values, currentX, currentY });

      if (x === undefined || y === undefined) return;

      pointSequence += 1;

      const pointId = id(`${input.elementId}-point-${String(pointSequence)}`);

      points.push({ id: pointId, x, y });

      if (command === 'M' || command === 'L' || command === 'H' || command === 'V') {
        segments.push({ id: segmentId, kind: command === 'M' ? 'move' : 'line', pointId });
      } else if (command === 'Q') {
        segments.push({ id: segmentId, kind: 'quadratic', control: [values[0] ?? x, values[1] ?? y], pointId });
      } else if (command === 'C') {
        segments.push({
          id: segmentId,
          kind: 'cubic',
          control1: [values[0] ?? x, values[1] ?? y],
          control2: [values[2] ?? x, values[3] ?? y],
          pointId,
        });
      }

      currentX = x;
      currentY = y;

      if (command === 'M') {
        subpathX = x;
        subpathY = y;
      }
    });

  return { points, segments, closed };
}
