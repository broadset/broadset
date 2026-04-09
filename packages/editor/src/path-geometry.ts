/**
 * Path geometry engine — parsing, serialization, handle extraction, bounds refit.
 *
 * Handles SVG path `d` attribute parsing into deterministic segments,
 * round-trip serialization with consistent rounding, extraction of editable
 * handles (anchor + control), and bounds refitting after path edits.
 */

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** One parsed segment of an SVG path `d` attribute. */
export interface PathSegment {
  /** SVG path command letter (uppercase = absolute, lowercase = relative). */
  readonly command: string;
  /** Coordinate values associated with this command. */
  readonly coords: readonly number[];
}

/** An editable handle point extracted from parsed path segments. */
export interface PathHandle {
  /** Whether this is an on-curve anchor or an off-curve control handle. */
  readonly type: 'anchor' | 'control';
  /** Handle X position (NaN when constrained). */
  readonly x: number;
  /** Handle Y position (NaN when constrained). */
  readonly y: number;
  /** Parent segment index. */
  readonly segmentIndex: number;
  /**
   * Index into the parent segment's coord array for the X value.
   * -1 when X is constrained (e.g. V command).
   */
  readonly xIndex: number;
  /**
   * Index into the parent segment's coord array for the Y value.
   * -1 when Y is constrained (e.g. H command).
   */
  readonly yIndex: number;
}

/** Input for axis-aligned bounds refit. */
export interface RefitPathBoundsInput {
  readonly pathData: string;
  readonly strokeWidth: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly currentWidth: number;
  readonly currentHeight: number;
}

/** Output of a bounds refit operation. */
export interface RefitPathBoundsResult {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pathData: string;
}

/** Input for tight SVG bounding-box refit. */
export interface RefitPathBoundsFromSvgInput {
  readonly pathData: string;
  readonly svgBBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly strokeWidth: number;
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

/** Coordinate rounding precision (decimal places). */
const PRECISION = 2;

/** Number of coordinates consumed per command letter (uppercase canonical). */
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

/* ================================================================== */
/*  Parsing                                                            */
/* ================================================================== */

/**
 * Tokenize an SVG path `d` attribute string into an array of command-letter
 * and number tokens.
 */
function tokenize(d: string): readonly string[] {
  const re = /[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

  return Array.from(d.matchAll(re), (match) => match[0]);
}

/**
 * Parse an SVG path `d` attribute into deterministic {@link PathSegment}s.
 *
 * - Supports all standard commands: M, L, H, V, C, S, Q, T, A, Z
 *   (both absolute and relative).
 * - Implicit repeated coordinate groups are split into explicit segments.
 * - Empty or whitespace-only strings yield an empty array.
 */
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

    // Must be a command letter
    const upperCmd = token.toUpperCase();

    if (!(upperCmd in COORD_COUNTS)) {
      // Skip unknown tokens
      i++;
      continue;
    }

    const cmd = token;
    const count = COORD_COUNTS[upperCmd] ?? 0;

    i++;

    if (count === 0) {
      // Z/z — no coordinates
      segments.push({ command: cmd, coords: [] });
      continue;
    }

    // Consume at least one group of coordinates
    let consumed = false;

    while (i + count <= tokens.length) {
      // Peek: the next token must be a number (not a command letter)
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

      // For the first group use the original command; for implicit repeats
      // use the same command (SVG spec: M implicit repeat becomes L, but
      // we preserve the original for round-trip stability within our engine).
      segments.push({ command: cmd, coords });
    }

    if (!consumed) {
      // Command with missing coordinates — emit with empty coords
      segments.push({ command: cmd, coords: [] });
    }
  }

  return segments;
}

/* ================================================================== */
/*  Serialization                                                      */
/* ================================================================== */

/** Round a number to {@link PRECISION} decimal places. */
function roundCoord(n: number): number {
  const factor = 10 ** PRECISION;

  return Math.round(n * factor) / factor;
}

/**
 * Serialize parsed path segments back to an SVG path `d` attribute string.
 *
 * Coordinates are rounded to {@link PRECISION} decimal places for consistency.
 */
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

/* ================================================================== */
/*  Relative → Absolute Conversion                                    */
/* ================================================================== */

/**
 * Convert all relative commands to absolute form, tracking the pen position.
 * This is needed for accurate bounds computation and coordinate rebasing.
 */
function toAbsoluteSegments(segments: readonly PathSegment[]): readonly PathSegment[] {
  const result: PathSegment[] = [];
  let penX = 0;
  let penY = 0;
  let startX = 0;
  let startY = 0;

  for (const seg of segments) {
    const isRelative = seg.command !== seg.command.toUpperCase();
    const upper = seg.command.toUpperCase();

    if (!isRelative) {
      result.push({ command: upper, coords: [...seg.coords] });

      // Update pen position for absolute commands
      if (upper === 'M' || upper === 'L' || upper === 'T') {
        penX = seg.coords[0] ?? 0;
        penY = seg.coords[1] ?? 0;

        if (upper === 'M') {
          startX = penX;
          startY = penY;
        }
      } else if (upper === 'H') {
        penX = seg.coords[0] ?? 0;
      } else if (upper === 'V') {
        penY = seg.coords[0] ?? 0;
      } else if (upper === 'C') {
        penX = seg.coords[4] ?? 0;
        penY = seg.coords[5] ?? 0;
      } else if (upper === 'S' || upper === 'Q') {
        penX = seg.coords[2] ?? 0;
        penY = seg.coords[3] ?? 0;
      } else if (upper === 'A') {
        penX = seg.coords[5] ?? 0;
        penY = seg.coords[6] ?? 0;
      } else if (upper === 'Z') {
        penX = startX;
        penY = startY;
      }

      continue;
    }

    // Convert relative to absolute
    const coords = [...seg.coords];

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      coords[0] = (coords[0] ?? 0) + penX;
      coords[1] = (coords[1] ?? 0) + penY;
      penX = coords[0];
      penY = coords[1];

      if (upper === 'M') {
        startX = penX;
        startY = penY;
      }
    } else if (upper === 'H') {
      coords[0] = (coords[0] ?? 0) + penX;
      penX = coords[0];
    } else if (upper === 'V') {
      coords[0] = (coords[0] ?? 0) + penY;
      penY = coords[0];
    } else if (upper === 'C') {
      coords[0] = (coords[0] ?? 0) + penX;
      coords[1] = (coords[1] ?? 0) + penY;
      coords[2] = (coords[2] ?? 0) + penX;
      coords[3] = (coords[3] ?? 0) + penY;
      coords[4] = (coords[4] ?? 0) + penX;
      coords[5] = (coords[5] ?? 0) + penY;
      penX = coords[4];
      penY = coords[5];
    } else if (upper === 'S' || upper === 'Q') {
      coords[0] = (coords[0] ?? 0) + penX;
      coords[1] = (coords[1] ?? 0) + penY;
      coords[2] = (coords[2] ?? 0) + penX;
      coords[3] = (coords[3] ?? 0) + penY;
      penX = coords[2];
      penY = coords[3];
    } else if (upper === 'A') {
      // rx, ry, angle, flags are NOT relative; only endpoint is
      coords[5] = (coords[5] ?? 0) + penX;
      coords[6] = (coords[6] ?? 0) + penY;
      penX = coords[5];
      penY = coords[6];
    } else if (upper === 'Z') {
      penX = startX;
      penY = startY;
    }

    result.push({ command: upper, coords });
  }

  return result;
}

/* ================================================================== */
/*  Handle Extraction                                                  */
/* ================================================================== */

/**
 * Extract editable {@link PathHandle}s from parsed path segments.
 *
 * Each handle references its parent segment index and the coordinate
 * indices it controls. Constrained axes use index = -1.
 */
export function extractHandles(segments: readonly PathSegment[]): readonly PathHandle[] {
  const absSegments = toAbsoluteSegments(segments);
  const handles: PathHandle[] = [];

  for (let si = 0; si < absSegments.length; si++) {
    const seg = absSegments[si];

    if (seg === undefined) {
      continue;
    }

    const upperCmd = seg.command.toUpperCase();

    if (upperCmd === 'M' || upperCmd === 'L' || upperCmd === 'T') {
      if (seg.coords.length >= 2) {
        handles.push({
          type: 'anchor',
          x: seg.coords[0] ?? 0,
          y: seg.coords[1] ?? 0,
          segmentIndex: si,
          xIndex: 0,
          yIndex: 1,
        });
      }
    } else if (upperCmd === 'H') {
      if (seg.coords.length >= 1) {
        handles.push({
          type: 'anchor',
          x: seg.coords[0] ?? 0,
          y: NaN,
          segmentIndex: si,
          xIndex: 0,
          yIndex: -1,
        });
      }
    } else if (upperCmd === 'V') {
      if (seg.coords.length >= 1) {
        handles.push({
          type: 'anchor',
          x: NaN,
          y: seg.coords[0] ?? 0,
          segmentIndex: si,
          xIndex: -1,
          yIndex: 0,
        });
      }
    } else if (upperCmd === 'C') {
      if (seg.coords.length >= 6) {
        handles.push(
          { type: 'control', x: seg.coords[0] ?? 0, y: seg.coords[1] ?? 0, segmentIndex: si, xIndex: 0, yIndex: 1 },
          { type: 'control', x: seg.coords[2] ?? 0, y: seg.coords[3] ?? 0, segmentIndex: si, xIndex: 2, yIndex: 3 },
          { type: 'anchor', x: seg.coords[4] ?? 0, y: seg.coords[5] ?? 0, segmentIndex: si, xIndex: 4, yIndex: 5 },
        );
      }
    } else if (upperCmd === 'S' || upperCmd === 'Q') {
      if (seg.coords.length >= 4) {
        handles.push(
          { type: 'control', x: seg.coords[0] ?? 0, y: seg.coords[1] ?? 0, segmentIndex: si, xIndex: 0, yIndex: 1 },
          { type: 'anchor', x: seg.coords[2] ?? 0, y: seg.coords[3] ?? 0, segmentIndex: si, xIndex: 2, yIndex: 3 },
        );
      }
    } else if (upperCmd === 'A') {
      if (seg.coords.length >= 7) {
        handles.push({
          type: 'anchor',
          x: seg.coords[5] ?? 0,
          y: seg.coords[6] ?? 0,
          segmentIndex: si,
          xIndex: 5,
          yIndex: 6,
        });
      }
    }
    // Z — no handles
  }

  return handles;
}

/* ================================================================== */
/*  Bounds Refit                                                       */
/* ================================================================== */

/**
 * Compute the axis-aligned bounding box of all coordinate pairs in the
 * given segments, returning min/max X and Y.
 */
function computeCoordBounds(
  segments: readonly PathSegment[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const absSegments = toAbsoluteSegments(segments);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const seg of absSegments) {
    const upper = seg.command.toUpperCase();

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      const x = seg.coords[0] ?? 0;
      const y = seg.coords[1] ?? 0;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      found = true;
    } else if (upper === 'H') {
      const x = seg.coords[0] ?? 0;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      found = true;
    } else if (upper === 'V') {
      const y = seg.coords[0] ?? 0;

      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      found = true;
    } else if (upper === 'C') {
      for (let i = 0; i < 6; i += 2) {
        const x = seg.coords[i] ?? 0;
        const y = seg.coords[i + 1] ?? 0;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      found = true;
    } else if (upper === 'S' || upper === 'Q') {
      for (let i = 0; i < 4; i += 2) {
        const x = seg.coords[i] ?? 0;
        const y = seg.coords[i + 1] ?? 0;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      found = true;
    } else if (upper === 'A') {
      const x = seg.coords[5] ?? 0;
      const y = seg.coords[6] ?? 0;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      found = true;
    }
  }

  return found ? { minX, minY, maxX, maxY } : null;
}

/**
 * Rebase all coordinates in the given segments by subtracting the origin offset.
 * Relative commands are converted to absolute first.
 */
function rebaseSegments(segments: readonly PathSegment[], offsetX: number, offsetY: number): readonly PathSegment[] {
  const absSegments = toAbsoluteSegments(segments);

  return absSegments.map((seg) => {
    const upper = seg.command.toUpperCase();

    if (upper === 'Z') {
      return seg;
    }

    const coords = [...seg.coords];

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      coords[0] = roundCoord((coords[0] ?? 0) - offsetX);
      coords[1] = roundCoord((coords[1] ?? 0) - offsetY);
    } else if (upper === 'H') {
      coords[0] = roundCoord((coords[0] ?? 0) - offsetX);
    } else if (upper === 'V') {
      coords[0] = roundCoord((coords[0] ?? 0) - offsetY);
    } else if (upper === 'C') {
      for (let i = 0; i < 6; i += 2) {
        coords[i] = roundCoord((coords[i] ?? 0) - offsetX);
        coords[i + 1] = roundCoord((coords[i + 1] ?? 0) - offsetY);
      }
    } else if (upper === 'S' || upper === 'Q') {
      for (let i = 0; i < 4; i += 2) {
        coords[i] = roundCoord((coords[i] ?? 0) - offsetX);
        coords[i + 1] = roundCoord((coords[i + 1] ?? 0) - offsetY);
      }
    } else if (upper === 'A') {
      coords[5] = roundCoord((coords[5] ?? 0) - offsetX);
      coords[6] = roundCoord((coords[6] ?? 0) - offsetY);
    }

    return { command: seg.command, coords };
  });
}

/**
 * Refit path element bounds after editing, using axis-aligned coordinate bounds.
 *
 * - Computes the coordinate-based bounding box with stroke padding.
 * - Rebases path coordinates to the new element origin.
 * - Empty paths preserve existing geometry.
 */
export function refitPathBounds(input: RefitPathBoundsInput): RefitPathBoundsResult {
  const segments = parsePath(input.pathData);

  if (segments.length === 0) {
    return {
      x: input.currentX,
      y: input.currentY,
      width: input.currentWidth,
      height: input.currentHeight,
      pathData: input.pathData,
    };
  }

  const bounds = computeCoordBounds(segments);

  if (bounds === null) {
    return {
      x: input.currentX,
      y: input.currentY,
      width: input.currentWidth,
      height: input.currentHeight,
      pathData: input.pathData,
    };
  }

  const padding = input.strokeWidth / 2;

  const x = bounds.minX - padding;
  const y = bounds.minY - padding;
  const width = bounds.maxX - bounds.minX + input.strokeWidth;
  const height = bounds.maxY - bounds.minY + input.strokeWidth;

  // Rebase coordinates so path origin aligns with new element (x, y) + padding
  const rebased = rebaseSegments(segments, bounds.minX, bounds.minY);
  const pathData = serializePath(rebased);

  return { x, y, width, height, pathData };
}

/**
 * Refit path element bounds using a tight SVG bounding box.
 *
 * This is more accurate for curves than axis-aligned coordinate bounds,
 * because the SVG renderer computes the actual geometric extrema.
 */
export function refitPathBoundsFromSvg(input: RefitPathBoundsFromSvgInput): RefitPathBoundsResult {
  const segments = parsePath(input.pathData);
  const padding = input.strokeWidth / 2;
  const { svgBBox } = input;

  const x = svgBBox.x - padding;
  const y = svgBBox.y - padding;
  const width = svgBBox.width + input.strokeWidth;
  const height = svgBBox.height + input.strokeWidth;

  // Rebase coordinates relative to the SVG bbox origin
  const rebased = rebaseSegments(segments, svgBBox.x, svgBBox.y);
  const pathData = serializePath(rebased);

  return { x, y, width, height, pathData };
}
