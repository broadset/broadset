// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PathSegment {
  readonly command: string;
  readonly values: readonly number[];
}

export interface PathHandle {
  readonly segmentIndex: number;
  readonly type: 'anchor' | 'control';
  readonly x: number;
  readonly y: number;
  readonly xIndex: number;
  readonly yIndex: number;
}

interface RefitInput {
  readonly pathData: string;
  readonly strokeWidth: number;
  readonly currentX: number;
  readonly currentY: number;
}

interface RefitResult {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pathData: string;
}

interface SvgRefitInput {
  readonly pathData: string;
  readonly svgBBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly currentX: number;
  readonly currentY: number;
}

// ---------------------------------------------------------------------------
// SVG path command parameter counts
// ---------------------------------------------------------------------------

const PARAM_COUNTS: Readonly<Record<string, number>> = {
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
  S: 4,
  s: 4,
  Q: 4,
  q: 4,
  T: 2,
  t: 2,
  A: 7,
  a: 7,
  Z: 0,
  z: 0,
};

/** Editor coordinate precision (decimal places). */
const PRECISION = 2;

function round(n: number): number {
  const factor = 10 ** PRECISION;

  return Math.round(n * factor) / factor;
}

// ---------------------------------------------------------------------------
// Path Command Parsing
// ---------------------------------------------------------------------------

const TOKEN_RE = /[A-Za-z]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g;

export function parsePath(d: string): PathSegment[] {
  if (d.trim() === '') return [];

  const tokens = d.match(TOKEN_RE);

  if (tokens === null) return [];

  const segments: PathSegment[] = [];
  let currentCmd = '';
  let values: number[] = [];

  for (const token of tokens) {
    if (token.length === 1 && token in PARAM_COUNTS) {
      // Flush previous command
      if (currentCmd !== '') {
        flushSegment(segments, currentCmd, values);
      }

      currentCmd = token;
      values = [];

      // Zero-parameter commands (Z) should be flushed immediately
      if ((PARAM_COUNTS[currentCmd] ?? 0) === 0) {
        flushSegment(segments, currentCmd, values);
        currentCmd = '';
      }
    } else {
      values.push(Number(token));

      const expected = PARAM_COUNTS[currentCmd] ?? 0;

      if (expected > 0 && values.length >= expected) {
        flushSegment(segments, currentCmd, values);

        // For implicit repeats, keep the same command but with the implicit
        // follow-on command (M → L, m → l)
        const implicitCmd = getImplicitCommand(currentCmd);

        currentCmd = implicitCmd;
        values = [];
      }
    }
  }

  // Flush any remaining values
  if (currentCmd !== '' && values.length > 0) {
    flushSegment(segments, currentCmd, values);
  }

  return segments;
}

function flushSegment(segments: PathSegment[], command: string, values: number[]): void {
  const expected = PARAM_COUNTS[command] ?? 0;

  if (expected === 0) {
    segments.push({ command: command.toUpperCase(), values: [] });
  } else if (values.length >= expected) {
    segments.push({ command: command.toUpperCase(), values: [...values.slice(0, expected)] });
  }
}

/**
 * After the first set of coordinates for M, subsequent coordinates
 * are treated as implicit L (or l for lowercase m).
 */
function getImplicitCommand(cmd: string): string {
  if (cmd === 'M') return 'L';
  if (cmd === 'm') return 'l';

  return cmd;
}

// ---------------------------------------------------------------------------
// Path Serialization
// ---------------------------------------------------------------------------

export function serializePath(segments: readonly PathSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.values.length === 0) return seg.command;

      const rounded = seg.values.map(round);

      return `${seg.command} ${rounded.join(' ')}`;
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Editable Handle Extraction
// ---------------------------------------------------------------------------

export function extractHandles(segments: readonly PathSegment[]): PathHandle[] {
  const handles: PathHandle[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg === undefined) continue;

    const { command, values } = seg;

    switch (command) {
      case 'M':
      case 'L':
      case 'T':
        handles.push({
          segmentIndex: i,
          type: 'anchor',
          x: values[0] ?? 0,
          y: values[1] ?? 0,
          xIndex: 0,
          yIndex: 1,
        });
        break;

      case 'C':
        // Two control handles + one anchor
        handles.push({
          segmentIndex: i,
          type: 'control',
          x: values[0] ?? 0,
          y: values[1] ?? 0,
          xIndex: 0,
          yIndex: 1,
        });
        handles.push({
          segmentIndex: i,
          type: 'control',
          x: values[2] ?? 0,
          y: values[3] ?? 0,
          xIndex: 2,
          yIndex: 3,
        });
        handles.push({
          segmentIndex: i,
          type: 'anchor',
          x: values[4] ?? 0,
          y: values[5] ?? 0,
          xIndex: 4,
          yIndex: 5,
        });
        break;

      case 'S':
        // One control + one anchor
        handles.push({
          segmentIndex: i,
          type: 'control',
          x: values[0] ?? 0,
          y: values[1] ?? 0,
          xIndex: 0,
          yIndex: 1,
        });
        handles.push({
          segmentIndex: i,
          type: 'anchor',
          x: values[2] ?? 0,
          y: values[3] ?? 0,
          xIndex: 2,
          yIndex: 3,
        });
        break;

      case 'Q':
        // One control + one anchor
        handles.push({
          segmentIndex: i,
          type: 'control',
          x: values[0] ?? 0,
          y: values[1] ?? 0,
          xIndex: 0,
          yIndex: 1,
        });
        handles.push({
          segmentIndex: i,
          type: 'anchor',
          x: values[2] ?? 0,
          y: values[3] ?? 0,
          xIndex: 2,
          yIndex: 3,
        });
        break;

      case 'H':
        handles.push({
          segmentIndex: i,
          type: 'anchor',
          x: values[0] ?? 0,
          y: 0,
          xIndex: 0,
          yIndex: -1,
        });
        break;

      case 'V':
        handles.push({
          segmentIndex: i,
          type: 'anchor',
          x: 0,
          y: values[0] ?? 0,
          xIndex: -1,
          yIndex: 0,
        });
        break;

      case 'A':
        // Arc endpoint anchor (last two values)
        handles.push({
          segmentIndex: i,
          type: 'anchor',
          x: values[5] ?? 0,
          y: values[6] ?? 0,
          xIndex: 5,
          yIndex: 6,
        });
        break;

      case 'Z':
        // No handles for close command
        break;

      default:
        break;
    }
  }

  return handles;
}

// ---------------------------------------------------------------------------
// Path Bounds Refit
// ---------------------------------------------------------------------------

function extractCoordinates(segments: readonly PathSegment[]): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const seg of segments) {
    const { command, values } = seg;

    switch (command) {
      case 'M':
      case 'L':
      case 'T':
        xs.push(values[0] ?? 0);
        ys.push(values[1] ?? 0);
        break;
      case 'C':
        xs.push(values[0] ?? 0, values[2] ?? 0, values[4] ?? 0);
        ys.push(values[1] ?? 0, values[3] ?? 0, values[5] ?? 0);
        break;
      case 'S':
      case 'Q':
        xs.push(values[0] ?? 0, values[2] ?? 0);
        ys.push(values[1] ?? 0, values[3] ?? 0);
        break;
      case 'H':
        xs.push(values[0] ?? 0);
        break;
      case 'V':
        ys.push(values[0] ?? 0);
        break;
      case 'A':
        xs.push(values[5] ?? 0);
        ys.push(values[6] ?? 0);
        break;
      default:
        break;
    }
  }

  return { xs, ys };
}

function rebaseSegments(segments: PathSegment[], dx: number, dy: number): PathSegment[] {
  return segments.map((seg) => {
    const { command, values } = seg;

    switch (command) {
      case 'M':
      case 'L':
      case 'T':
        return { command, values: [round((values[0] ?? 0) - dx), round((values[1] ?? 0) - dy)] };
      case 'C':
        return {
          command,
          values: [
            round((values[0] ?? 0) - dx),
            round((values[1] ?? 0) - dy),
            round((values[2] ?? 0) - dx),
            round((values[3] ?? 0) - dy),
            round((values[4] ?? 0) - dx),
            round((values[5] ?? 0) - dy),
          ],
        };
      case 'S':
      case 'Q':
        return {
          command,
          values: [
            round((values[0] ?? 0) - dx),
            round((values[1] ?? 0) - dy),
            round((values[2] ?? 0) - dx),
            round((values[3] ?? 0) - dy),
          ],
        };
      case 'H':
        return { command, values: [round((values[0] ?? 0) - dx)] };
      case 'V':
        return { command, values: [round((values[0] ?? 0) - dy)] };
      case 'A':
        return {
          command,
          values: [
            values[0] ?? 0,
            values[1] ?? 0,
            values[2] ?? 0,
            values[3] ?? 0,
            values[4] ?? 0,
            round((values[5] ?? 0) - dx),
            round((values[6] ?? 0) - dy),
          ],
        };
      default:
        return seg;
    }
  });
}

export function refitPathBounds(input: RefitInput): RefitResult {
  const segments = parsePath(input.pathData);

  if (segments.length === 0) {
    return {
      x: input.currentX,
      y: input.currentY,
      width: 0,
      height: 0,
      pathData: input.pathData,
    };
  }

  const { xs, ys } = extractCoordinates(segments);

  if (xs.length === 0 || ys.length === 0) {
    return {
      x: input.currentX,
      y: input.currentY,
      width: 0,
      height: 0,
      pathData: input.pathData,
    };
  }

  const halfStroke = input.strokeWidth / 2;
  const minX = Math.min(...xs) - halfStroke;
  const minY = Math.min(...ys) - halfStroke;
  const maxX = Math.max(...xs) + halfStroke;
  const maxY = Math.max(...ys) + halfStroke;

  const rebased = rebaseSegments([...segments], minX + halfStroke, minY + halfStroke);

  return {
    x: round(input.currentX + minX),
    y: round(input.currentY + minY),
    width: round(maxX - minX),
    height: round(maxY - minY),
    pathData: serializePath(rebased),
  };
}

// ---------------------------------------------------------------------------
// Tight SVG Bounding-Box Refit
// ---------------------------------------------------------------------------

export function refitPathBoundsSvg(input: SvgRefitInput): RefitResult {
  const segments = parsePath(input.pathData);
  const { svgBBox } = input;

  const rebased = rebaseSegments([...segments], svgBBox.x, svgBBox.y);

  return {
    x: round(input.currentX + svgBBox.x),
    y: round(input.currentY + svgBBox.y),
    width: round(svgBBox.width),
    height: round(svgBBox.height),
    pathData: serializePath(rebased),
  };
}
