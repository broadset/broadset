import { projectFormatV1 } from '@broadset/model';

import type { ParsedPdfPageV1, PdfMatrixV1, PdfPathCommandV1 } from './types';

const MINIMUM_BOUND = 1;

interface PdfBoundsV1 {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function flipPdfPointV1(
  page: ParsedPdfPageV1,
  point: readonly [number, number],
): readonly [number, number] {
  return [point[0] - page.mediaBoxX, page.height - (point[1] - page.mediaBoxY)];
}

function commandPoints(command: PdfPathCommandV1): readonly (readonly [number, number])[] {
  if (command.kind === 'close') return [];
  if (command.kind === 'cubic') return [command.control1, command.control2, command.point];

  return [command.point];
}

export function pathBoundsV1(page: ParsedPdfPageV1, commands: readonly PdfPathCommandV1[]): PdfBoundsV1 {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;

  for (const command of commands) {
    for (const point of commandPoints(command)) {
      const [x, y] = flipPdfPointV1(page, point);

      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }

  if (!Number.isFinite(minimumX) || !Number.isFinite(minimumY)) {
    return { x: 0, y: 0, width: MINIMUM_BOUND, height: MINIMUM_BOUND };
  }

  return {
    x: minimumX,
    y: minimumY,
    width: Math.max(MINIMUM_BOUND, maximumX - minimumX),
    height: Math.max(MINIMUM_BOUND, maximumY - minimumY),
  };
}

export function mapPathGeometryV1(input: {
  readonly page: ParsedPdfPageV1;
  readonly commands: readonly PdfPathCommandV1[];
  readonly elementId: projectFormatV1.Id;
  readonly bounds: PdfBoundsV1;
}): projectFormatV1.StructuredPath {
  const points: projectFormatV1.PathPoint[] = [];
  const segments: projectFormatV1.PathSegment[] = [];
  let pointSequence = 0;
  let segmentSequence = 0;
  let closed = false;

  function pointId(point: readonly [number, number]): projectFormatV1.Id {
    pointSequence += 1;

    const id = projectFormatV1.idSchema.parse(`${input.elementId}-point-${String(pointSequence)}`);
    const flipped = flipPdfPointV1(input.page, point);

    points.push({ id, x: flipped[0] - input.bounds.x, y: flipped[1] - input.bounds.y });

    return id;
  }

  for (const command of input.commands) {
    segmentSequence += 1;

    const id = projectFormatV1.idSchema.parse(`${input.elementId}-segment-${String(segmentSequence)}`);

    if (command.kind === 'close') {
      closed = true;
      segments.push({ id, kind: 'close' });
    } else if (command.kind === 'cubic') {
      const control1 = flipPdfPointV1(input.page, command.control1);
      const control2 = flipPdfPointV1(input.page, command.control2);

      segments.push({
        id,
        kind: 'cubic',
        control1: [control1[0] - input.bounds.x, control1[1] - input.bounds.y],
        control2: [control2[0] - input.bounds.x, control2[1] - input.bounds.y],
        pointId: pointId(command.point),
      });
    } else {
      segments.push({ id, kind: command.kind, pointId: pointId(command.point) });
    }
  }

  return { points, segments, closed };
}

export function imageGeometryV1(
  page: ParsedPdfPageV1,
  matrix: PdfMatrixV1,
): projectFormatV1.ElementGeometry {
  return projectFormatV1.createElementGeometry({
    width: 1,
    height: 1,
    transform: {
      kind: 'affine2d',
      matrix: [
        matrix[0],
        -matrix[1],
        -matrix[2],
        matrix[3],
        matrix[2] + matrix[4] - page.mediaBoxX,
        page.height - (matrix[3] + matrix[5] - page.mediaBoxY),
      ],
    },
  });
}

export function geometryFromBoundsV1(bounds: PdfBoundsV1): projectFormatV1.ElementGeometry {
  return projectFormatV1.createElementGeometry({
    width: bounds.width,
    height: bounds.height,
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, bounds.x, bounds.y] },
  });
}
