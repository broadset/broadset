/**
 * Phase 2 `_shared/shape-classifier/` — classifies an SVG path `d`
 * attribute as a canonical Broadset rectangle / ellipse / path so that
 * SVG, PDF, PPTX, and PSD importers can map common shapes back to the
 * native `rectangle` and `ellipse` element types. Generic / exotic
 * paths fall through to `{ kind: 'path' }` and are preserved verbatim
 * by the caller.
 *
 * Heuristics per the io-prereqs plan:
 * - Four right-angled line segments forming a closed box → rectangle.
 * - Four cubic Bézier segments matching the canonical kappa-ellipse
 *   layout → ellipse.
 * - Anything else → path.
 */

export interface ClassifiedRectangle {
  readonly kind: 'rectangle';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ClassifiedEllipse {
  readonly kind: 'ellipse';
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export interface ClassifiedPath {
  readonly kind: 'path';
}

export type ClassifiedShape = ClassifiedRectangle | ClassifiedEllipse | ClassifiedPath;

/**
 * Optional caller hints for {@link classifyPath}. Currently holds a
 * forward-compat surface for future disambiguation — e.g. a thick
 * stroke widens the tolerance for detecting a rectangle where the
 * exported path slightly overshoots the corners. No hint fields are
 * consumed by the current heuristics; importers may pass hints without
 * any behavior change today.
 */
export interface ShapeClassifierHints {
  readonly strokeWidth?: number;
}

interface ParsedSegment {
  readonly command: 'M' | 'L' | 'H' | 'V' | 'C' | 'Z';
  readonly points: readonly (readonly [number, number])[];
}

type Point = readonly [number, number];

const COMMAND_ARGUMENT_COUNTS: Record<string, number> = {
  M: 2,
  m: 2,
  L: 2,
  l: 2,
  H: 1,
  h: 1,
  V: 1,
  v: 1,
  C: 6,
  c: 6,
  Z: 0,
  z: 0,
};

const KAPPA = 0.5522847498;
const COORDINATE_TOLERANCE = 1e-3;
const ELLIPSE_RADIUS_TOLERANCE_FRACTION = 0.01;
const RECTANGLE_MIN_SEGMENTS = 5;
const RECTANGLE_MAX_SEGMENTS = 6;
const ELLIPSE_SEGMENT_COUNT = 6;

function approximatelyEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

function tokenizePath(d: string): readonly string[] | null {
  const tokens = d
    .replace(/([MmLlHhVvCcZz])/g, ' $1 ')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  return tokens.length === 0 ? null : tokens;
}

function isCommandToken(token: string): boolean {
  return Object.hasOwn(COMMAND_ARGUMENT_COUNTS, token);
}

function parseNumberToken(token: string): number | null {
  const parsed = Number.parseFloat(token);

  return Number.isFinite(parsed) ? parsed : null;
}

interface ParserState {
  current: Point;
  subpathStart: Point;
}

function parseSvgPath(d: string): readonly ParsedSegment[] | null {
  const tokens = tokenizePath(d);

  if (tokens === null) return null;

  const segments: ParsedSegment[] = [];
  const state: ParserState = { current: [0, 0], subpathStart: [0, 0] };
  let index = 0;

  while (index < tokens.length) {
    const commandToken = tokens[index];

    if (commandToken === undefined || !isCommandToken(commandToken)) return null;

    const argumentCount = COMMAND_ARGUMENT_COUNTS[commandToken];

    if (argumentCount === undefined) return null;

    index++;

    if (argumentCount === 0) {
      segments.push({ command: 'Z', points: [] });
      state.current = state.subpathStart;
      continue;
    }

    const argumentsEnd = findNextCommandIndex(tokens, index);
    const rawArguments = tokens.slice(index, argumentsEnd);

    index = argumentsEnd;

    const values = parseArgumentNumbers(rawArguments);

    if (values === null || values.length === 0 || values.length % argumentCount !== 0) return null;

    for (let offset = 0; offset < values.length; offset += argumentCount) {
      const slice = values.slice(offset, offset + argumentCount);
      const segment = applyCommand(commandToken, slice, state);

      if (segment === null) return null;

      segments.push(segment);
    }
  }

  return segments;
}

function findNextCommandIndex(tokens: readonly string[], start: number): number {
  for (let i = start; i < tokens.length; i++) {
    if (isCommandToken(tokens[i] ?? '')) return i;
  }

  return tokens.length;
}

function parseArgumentNumbers(tokens: readonly string[]): number[] | null {
  const values: number[] = [];

  for (const token of tokens) {
    const value = parseNumberToken(token);

    if (value === null) return null;

    values.push(value);
  }

  return values;
}

function absolutePoint(isRelative: boolean, current: Point, dx: number, dy: number): Point {
  return isRelative ? [current[0] + dx, current[1] + dy] : [dx, dy];
}

function applyCommand(command: string, args: readonly number[], state: ParserState): ParsedSegment | null {
  const isRelative = command === command.toLowerCase();

  switch (command.toUpperCase()) {
    case 'M':
      return applyMoveCommand(args, isRelative, state);
    case 'L':
      return applyLineCommand(args, isRelative, state);
    case 'H':
      return applyHorizontalCommand(args, isRelative, state);
    case 'V':
      return applyVerticalCommand(args, isRelative, state);
    case 'C':
      return applyCubicCommand(args, isRelative, state);
    default:
      return null;
  }
}

function applyMoveCommand(args: readonly number[], isRelative: boolean, state: ParserState): ParsedSegment | null {
  const [x, y] = args;

  if (x === undefined || y === undefined) return null;

  const absolute = absolutePoint(isRelative, state.current, x, y);

  state.current = absolute;
  state.subpathStart = absolute;

  return { command: 'M', points: [absolute] };
}

function applyLineCommand(args: readonly number[], isRelative: boolean, state: ParserState): ParsedSegment | null {
  const [x, y] = args;

  if (x === undefined || y === undefined) return null;

  const absolute = absolutePoint(isRelative, state.current, x, y);

  state.current = absolute;

  return { command: 'L', points: [absolute] };
}

function applyHorizontalCommand(
  args: readonly number[],
  isRelative: boolean,
  state: ParserState,
): ParsedSegment | null {
  const [x] = args;

  if (x === undefined) return null;

  const absolute: Point = isRelative ? [state.current[0] + x, state.current[1]] : [x, state.current[1]];

  state.current = absolute;

  return { command: 'H', points: [absolute] };
}

function applyVerticalCommand(args: readonly number[], isRelative: boolean, state: ParserState): ParsedSegment | null {
  const [y] = args;

  if (y === undefined) return null;

  const absolute: Point = isRelative ? [state.current[0], state.current[1] + y] : [state.current[0], y];

  state.current = absolute;

  return { command: 'V', points: [absolute] };
}

function applyCubicCommand(args: readonly number[], isRelative: boolean, state: ParserState): ParsedSegment | null {
  const [c1x, c1y, c2x, c2y, x, y] = args;

  if (
    c1x === undefined ||
    c1y === undefined ||
    c2x === undefined ||
    c2y === undefined ||
    x === undefined ||
    y === undefined
  ) {
    return null;
  }

  const cp1 = absolutePoint(isRelative, state.current, c1x, c1y);
  const cp2 = absolutePoint(isRelative, state.current, c2x, c2y);
  const endpoint = absolutePoint(isRelative, state.current, x, y);

  state.current = endpoint;

  return { command: 'C', points: [cp1, cp2, endpoint] };
}

function hasMultipleSubpaths(segments: readonly ParsedSegment[]): boolean {
  return segments.filter((segment) => segment.command === 'M').length > 1;
}

function collectRectangleCorners(segments: readonly ParsedSegment[]): Point[] | null {
  const start = segments[0]?.points[0];

  if (start === undefined) return null;

  const corners: Point[] = [[start[0], start[1]]];
  const closingIndex = segments.length - 1;

  for (let i = 1; i < closingIndex; i++) {
    const segment = segments[i];

    if (segment === undefined) return null;
    if (segment.command !== 'L' && segment.command !== 'H' && segment.command !== 'V') return null;

    const point = segment.points[0];

    if (point === undefined) return null;

    corners.push([point[0], point[1]]);
  }

  return corners;
}

function cornersFormAxisAlignedEdges(corners: readonly Point[]): boolean {
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[i + 1];

    if (a === undefined || b === undefined) return false;

    const sameX = approximatelyEqual(a[0], b[0], COORDINATE_TOLERANCE);
    const sameY = approximatelyEqual(a[1], b[1], COORDINATE_TOLERANCE);

    if (sameX === sameY) return false;
  }

  return true;
}

function cornersCloseBackToStart(corners: readonly Point[]): boolean {
  const c0 = corners[0];
  const c4 = corners[4];

  if (c0 === undefined || c4 === undefined) return false;

  return (
    approximatelyEqual(c0[0], c4[0], COORDINATE_TOLERANCE) && approximatelyEqual(c0[1], c4[1], COORDINATE_TOLERANCE)
  );
}

function classifyRectangle(segments: readonly ParsedSegment[]): ClassifiedRectangle | null {
  if (segments.length < RECTANGLE_MIN_SEGMENTS || segments.length > RECTANGLE_MAX_SEGMENTS) return null;
  if (segments[0]?.command !== 'M') return null;
  if (segments[segments.length - 1]?.command !== 'Z') return null;

  const corners = collectRectangleCorners(segments);

  if (corners === null) return null;

  const start = corners[0];

  if (start === undefined) return null;

  // Pad the 3-edge form (Z closes the fourth side implicitly) so the
  // adjacency checks below see a uniform 5-point loop.
  if (corners.length === 4) {
    corners.push([start[0], start[1]]);
  }

  if (corners.length !== 5) return null;
  if (!cornersFormAxisAlignedEdges(corners)) return null;
  if (!cornersCloseBackToStart(corners)) return null;

  const xs = corners.slice(0, 4).map(([x]) => x);
  const ys = corners.slice(0, 4).map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0 || height <= 0) return null;

  return { kind: 'rectangle', x: minX, y: minY, width, height };
}

function collectEllipseEndpoints(segments: readonly ParsedSegment[]): Point[] | null {
  const start = segments[0]?.points[0];

  if (start === undefined) return null;

  const endpoints: Point[] = [[start[0], start[1]]];

  for (let i = 1; i <= 4; i++) {
    const segment = segments[i];

    if (segment === undefined) return null;

    const endpoint = segment.points[2];

    if (endpoint === undefined) return null;

    endpoints.push([endpoint[0], endpoint[1]]);
  }

  return endpoints;
}

interface EllipseAxes {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly tolerance: number;
}

function deriveEllipseAxes(endpoints: readonly Point[]): EllipseAxes | null {
  const [p0, p1, p2, p3] = endpoints;

  if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) return null;

  const cxA = (p0[0] + p2[0]) / 2;
  const cyA = (p0[1] + p2[1]) / 2;
  const cxB = (p1[0] + p3[0]) / 2;
  const cyB = (p1[1] + p3[1]) / 2;
  const axisTolerance =
    Math.max(Math.abs(p0[0] - p2[0]) + Math.abs(p0[1] - p2[1]), Math.abs(p1[0] - p3[0]) + Math.abs(p1[1] - p3[1]), 1) *
    ELLIPSE_RADIUS_TOLERANCE_FRACTION;

  if (!approximatelyEqual(cxA, cxB, axisTolerance)) return null;
  if (!approximatelyEqual(cyA, cyB, axisTolerance)) return null;

  const cx = (cxA + cxB) / 2;
  const cy = (cyA + cyB) / 2;
  const p0OnHorizontalAxis = approximatelyEqual(p0[1], cy, axisTolerance);
  const p0OnVerticalAxis = approximatelyEqual(p0[0], cx, axisTolerance);

  let rx: number;
  let ry: number;

  if (p0OnHorizontalAxis) {
    rx = Math.abs(p0[0] - cx);
    ry = Math.abs(p1[1] - cy);
  } else if (p0OnVerticalAxis) {
    ry = Math.abs(p0[1] - cy);
    rx = Math.abs(p1[0] - cx);
  } else {
    return null;
  }

  if (rx <= 0 || ry <= 0) return null;

  return { cx, cy, rx, ry, tolerance: axisTolerance };
}

function offsetDirection(start: number, end: number): number {
  if (end > start) return 1;
  if (end < start) return -1;

  return 0;
}

function firstControlPointsMatchKappa(
  firstSegment: ParsedSegment,
  axes: EllipseAxes,
  endpoints: readonly Point[],
): boolean {
  const [cp1, , end] = firstSegment.points;
  const start = endpoints[0];

  if (cp1 === undefined || end === undefined || start === undefined) return false;

  const p0 = endpoints[0];

  if (p0 === undefined) return false;

  const p0OnHorizontalAxis = approximatelyEqual(p0[1], axes.cy, axes.tolerance);
  const xOffset = p0OnHorizontalAxis ? 0 : axes.rx;
  const yOffset = p0OnHorizontalAxis ? axes.ry : 0;
  const expectedCp1X = start[0] + offsetDirection(start[0], end[0]) * KAPPA * xOffset;
  const expectedCp1Y = start[1] + offsetDirection(start[1], end[1]) * KAPPA * yOffset;
  const controlTolerance = Math.max(axes.rx, axes.ry) * ELLIPSE_RADIUS_TOLERANCE_FRACTION;

  return (
    approximatelyEqual(cp1[0], expectedCp1X, controlTolerance) &&
    approximatelyEqual(cp1[1], expectedCp1Y, controlTolerance)
  );
}

function classifyEllipse(segments: readonly ParsedSegment[]): ClassifiedEllipse | null {
  if (segments.length !== ELLIPSE_SEGMENT_COUNT) return null;
  if (segments[0]?.command !== 'M') return null;
  if (segments[5]?.command !== 'Z') return null;

  for (let i = 1; i <= 4; i++) {
    if (segments[i]?.command !== 'C') return null;
  }

  const endpoints = collectEllipseEndpoints(segments);

  if (endpoints === null) return null;

  const axes = deriveEllipseAxes(endpoints);

  if (axes === null) return null;

  const firstSegment = segments[1];

  if (firstSegment === undefined) return null;
  if (!firstControlPointsMatchKappa(firstSegment, axes, endpoints)) return null;

  return { kind: 'ellipse', cx: axes.cx, cy: axes.cy, rx: axes.rx, ry: axes.ry };
}

/**
 * Classifies an SVG path `d` attribute into a native Broadset shape kind.
 * Returns `{ kind: 'path' }` on malformed, multi-subpath, or unrecognized
 * geometry — the caller preserves the path verbatim per IO-D-18.
 *
 * @param d — the SVG path data string.
 * @param _hints — reserved for future disambiguation (stroke-width
 * aware tolerance, etc.); accepted but currently unused so importers
 * can wire the call site without a signature change later.
 */
export function classifyPath(d: string, _hints?: ShapeClassifierHints): ClassifiedShape {
  const trimmed = d.trim();

  if (trimmed === '') return { kind: 'path' };

  const segments = parseSvgPath(trimmed);

  if (segments === null) return { kind: 'path' };
  if (hasMultipleSubpaths(segments)) return { kind: 'path' };

  const rectangle = classifyRectangle(segments);

  if (rectangle !== null) return rectangle;

  const ellipse = classifyEllipse(segments);

  if (ellipse !== null) return ellipse;

  return { kind: 'path' };
}
