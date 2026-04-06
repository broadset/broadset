interface Point {
  readonly x: number;
  readonly y: number;
}

interface SamplePoint extends Point {
  readonly distance: number;
}

export interface MotionSample extends Point {
  readonly angleDegrees: number;
}

interface PathSegment {
  readonly start: Point;
  readonly end: Point;
  pointAt(t: number): Point;
}

const MOTION_PATH_SAMPLE_COUNT = 64;

function parsePathTokens(pathData: string): readonly string[] {
  return pathData.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gu) ?? [];
}

function createLineSegment(start: Point, end: Point): PathSegment {
  return {
    start,
    end,
    pointAt(t: number): Point {
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    },
  };
}

function createQuadraticSegment(start: Point, control: Point, end: Point): PathSegment {
  return {
    start,
    end,
    pointAt(t: number): Point {
      const inverse = 1 - t;

      return {
        x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
        y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
      };
    },
  };
}

function createCubicSegment(start: Point, controlOne: Point, controlTwo: Point, end: Point): PathSegment {
  return {
    start,
    end,
    pointAt(t: number): Point {
      const inverse = 1 - t;

      return {
        x:
          inverse * inverse * inverse * start.x +
          3 * inverse * inverse * t * controlOne.x +
          3 * inverse * t * t * controlTwo.x +
          t * t * t * end.x,
        y:
          inverse * inverse * inverse * start.y +
          3 * inverse * inverse * t * controlOne.y +
          3 * inverse * t * t * controlTwo.y +
          t * t * t * end.y,
      };
    },
  };
}

function parseMotionPath(pathData: string): readonly PathSegment[] {
  const tokens = parsePathTokens(pathData);
  const segments: PathSegment[] = [];
  let tokenIndex = 0;
  let currentPoint: Point = { x: 0, y: 0 };
  let subpathStart: Point = currentPoint;
  let command = '';

  while (tokenIndex < tokens.length) {
    const nextToken = tokens[tokenIndex];

    if (nextToken === undefined) {
      break;
    }

    if (/^[a-zA-Z]$/u.test(nextToken)) {
      command = nextToken;
      tokenIndex += 1;
    }

    const relative = command === command.toLowerCase();
    const normalizedCommand = command.toUpperCase();

    switch (normalizedCommand) {
      case 'M': {
        const x = Number(tokens[tokenIndex] ?? '0');
        const y = Number(tokens[tokenIndex + 1] ?? '0');

        tokenIndex += 2;
        currentPoint = relative ? { x: currentPoint.x + x, y: currentPoint.y + y } : { x, y };
        subpathStart = currentPoint;
        command = relative ? 'l' : 'L';
        break;
      }

      case 'L': {
        const x = Number(tokens[tokenIndex] ?? '0');
        const y = Number(tokens[tokenIndex + 1] ?? '0');

        tokenIndex += 2;

        const end = relative ? { x: currentPoint.x + x, y: currentPoint.y + y } : { x, y };

        segments.push(createLineSegment(currentPoint, end));
        currentPoint = end;
        break;
      }

      case 'Q': {
        const controlX = Number(tokens[tokenIndex] ?? '0');
        const controlY = Number(tokens[tokenIndex + 1] ?? '0');
        const endX = Number(tokens[tokenIndex + 2] ?? '0');
        const endY = Number(tokens[tokenIndex + 3] ?? '0');

        tokenIndex += 4;

        const control =
          relative ? { x: currentPoint.x + controlX, y: currentPoint.y + controlY } : { x: controlX, y: controlY };
        const end = relative ? { x: currentPoint.x + endX, y: currentPoint.y + endY } : { x: endX, y: endY };

        segments.push(createQuadraticSegment(currentPoint, control, end));
        currentPoint = end;
        break;
      }

      case 'C': {
        const controlOneX = Number(tokens[tokenIndex] ?? '0');
        const controlOneY = Number(tokens[tokenIndex + 1] ?? '0');
        const controlTwoX = Number(tokens[tokenIndex + 2] ?? '0');
        const controlTwoY = Number(tokens[tokenIndex + 3] ?? '0');
        const endX = Number(tokens[tokenIndex + 4] ?? '0');
        const endY = Number(tokens[tokenIndex + 5] ?? '0');

        tokenIndex += 6;

        const controlOne =
          relative ?
            { x: currentPoint.x + controlOneX, y: currentPoint.y + controlOneY }
          : { x: controlOneX, y: controlOneY };
        const controlTwo =
          relative ?
            { x: currentPoint.x + controlTwoX, y: currentPoint.y + controlTwoY }
          : { x: controlTwoX, y: controlTwoY };
        const end = relative ? { x: currentPoint.x + endX, y: currentPoint.y + endY } : { x: endX, y: endY };

        segments.push(createCubicSegment(currentPoint, controlOne, controlTwo, end));
        currentPoint = end;
        break;
      }

      case 'Z': {
        segments.push(createLineSegment(currentPoint, subpathStart));
        currentPoint = subpathStart;
        break;
      }

      default:
        tokenIndex += 1;
        break;
    }
  }

  return segments;
}

function getSegmentSamples(segment: PathSegment): readonly SamplePoint[] {
  const samples: SamplePoint[] = [{ x: segment.start.x, y: segment.start.y, distance: 0 }];
  let distance = 0;
  let previousPoint = segment.start;

  for (let index = 1; index <= MOTION_PATH_SAMPLE_COUNT; index += 1) {
    const point = segment.pointAt(index / MOTION_PATH_SAMPLE_COUNT);
    const deltaX = point.x - previousPoint.x;
    const deltaY = point.y - previousPoint.y;

    distance += Math.hypot(deltaX, deltaY);
    samples.push({ x: point.x, y: point.y, distance });
    previousPoint = point;
  }

  return samples;
}

/**
 * Samples an SVG motion path by approximate arc length so timeline playback can
 * map normalized progress to stable x/y coordinates and tangent rotation.
 */
export function sampleMotionPath(pathData: string, progress: number): MotionSample {
  const segments = parseMotionPath(pathData);

  if (segments.length === 0) {
    return { x: 0, y: 0, angleDegrees: 0 };
  }

  const segmentSamples = segments.map((segment) => getSegmentSamples(segment));
  const segmentLengths = segmentSamples.map((samples) => samples[samples.length - 1]?.distance ?? 0);
  const totalLength = segmentLengths.reduce((sum, value) => sum + value, 0);

  if (totalLength <= 0) {
    const firstSegment = segments[0];

    if (firstSegment === undefined) {
      return { x: 0, y: 0, angleDegrees: 0 };
    }

    return { x: firstSegment.start.x, y: firstSegment.start.y, angleDegrees: 0 };
  }

  const targetDistance = totalLength * Math.max(0, Math.min(1, progress));
  let traversedLength = 0;

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const samples = segmentSamples[segmentIndex];
    const segmentLength = segmentLengths[segmentIndex] ?? 0;

    if (samples === undefined) {
      continue;
    }

    if (targetDistance > traversedLength + segmentLength && segmentIndex < segments.length - 1) {
      traversedLength += segmentLength;
      continue;
    }

    const localDistance = targetDistance - traversedLength;

    for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
      const previousSample = samples[sampleIndex - 1];
      const currentSample = samples[sampleIndex];

      if (previousSample === undefined || currentSample === undefined) {
        continue;
      }

      if (currentSample.distance < localDistance && sampleIndex < samples.length - 1) {
        continue;
      }

      const distanceDelta = currentSample.distance - previousSample.distance;
      const interpolation = distanceDelta <= 0 ? 0 : (localDistance - previousSample.distance) / distanceDelta;
      const x = previousSample.x + (currentSample.x - previousSample.x) * interpolation;
      const y = previousSample.y + (currentSample.y - previousSample.y) * interpolation;
      const angleDegrees =
        Math.atan2(currentSample.y - previousSample.y, currentSample.x - previousSample.x) * (180 / Math.PI);

      return { x, y, angleDegrees };
    }

    const lastSample = samples[samples.length - 1];

    if (lastSample !== undefined) {
      return { x: lastSample.x, y: lastSample.y, angleDegrees: 0 };
    }
  }

  const fallback = segments[segments.length - 1]?.end ?? { x: 0, y: 0 };

  return { x: fallback.x, y: fallback.y, angleDegrees: 0 };
}
