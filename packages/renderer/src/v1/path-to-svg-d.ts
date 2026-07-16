import type { projectFormatV1 } from '@broadset/model';

import { formatCssNumber } from './paint-css';

type Id = projectFormatV1.Id;
type PathPoint = projectFormatV1.PathPoint;
type PathSegment = projectFormatV1.PathSegment;
type StructuredPath = projectFormatV1.StructuredPath;

function pointCoordinates(point: PathPoint): string {
  return `${formatCssNumber(point.x)} ${formatCssNumber(point.y)}`;
}

function commandForPoint(command: 'M' | 'L', pointId: Id, points: ReadonlyMap<Id, PathPoint>): string | undefined {
  const point = points.get(pointId);

  return point === undefined ? undefined : `${command} ${pointCoordinates(point)}`;
}

function segmentToCommand(segment: PathSegment, points: ReadonlyMap<Id, PathPoint>): string | undefined {
  switch (segment.kind) {
    case 'move':
      return commandForPoint('M', segment.pointId, points);
    case 'line':
      return commandForPoint('L', segment.pointId, points);

    case 'quadratic': {
      const point = points.get(segment.pointId);

      if (point === undefined) return undefined;

      const [controlX, controlY] = segment.control;

      return `Q ${formatCssNumber(controlX)} ${formatCssNumber(controlY)} ${pointCoordinates(point)}`;
    }

    case 'cubic': {
      const point = points.get(segment.pointId);

      if (point === undefined) return undefined;

      const [control1X, control1Y] = segment.control1;
      const [control2X, control2Y] = segment.control2;

      return `C ${formatCssNumber(control1X)} ${formatCssNumber(control1Y)} ${formatCssNumber(control2X)} ${formatCssNumber(control2Y)} ${pointCoordinates(point)}`;
    }

    case 'close':
      return 'Z';
  }
}

/** Serialize a v1 structured path to SVG path data, omitting segments with dangling point references. */
export function pathToSvgD(path: StructuredPath): string {
  const points = new Map(path.points.map((point) => [point.id, point]));
  const commands = path.segments
    .map((segment) => segmentToCommand(segment, points))
    .filter((command): command is string => command !== undefined);
  const hasCloseSegment = path.segments.some((segment) => segment.kind === 'close');

  return [...commands, ...(path.closed && !hasCloseSegment ? ['Z'] : [])].join(' ');
}
