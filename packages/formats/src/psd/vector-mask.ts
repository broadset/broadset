import type { BezierKnot, BezierPath } from 'ag-psd';

import { DEFAULT_FILL_RULE, PSD_COORD_MAX } from './constants';

interface SvgCommand {
  readonly cmd: string;
  readonly args: readonly number[];
}

function parseSvgPath(d: string): readonly SvgCommand[] {
  const commands: SvgCommand[] = [];
  const re = /([MLCQZHVSmlcqzhvs])([^MLCQZHVSmlcqzhvs]*)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(d)) !== null) {
    const cmd = m[1] ?? '';
    const argsStr = (m[2] ?? '').trim();
    const args =
      argsStr ?
        argsStr
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => !Number.isNaN(n))
      : [];

    commands.push({ cmd, args });
  }

  return commands;
}

interface PathScale {
  readonly scaleX: number;
  readonly scaleY: number;
}

function straightKnot(x: number, y: number, scale: PathScale): BezierKnot {
  const sy = y * scale.scaleY;
  const sx = x * scale.scaleX;

  return { linked: true, points: [sy, sx, sy, sx, sy, sx] };
}

function applyMoveCommand(args: readonly number[], scale: PathScale, knots: BezierKnot[]): void {
  if (args.length < 2) return;

  knots.push(straightKnot(args[0] ?? 0, args[1] ?? 0, scale));
}

function applyLineCommand(args: readonly number[], scale: PathScale, knots: BezierKnot[]): void {
  for (let i = 0; i + 1 < args.length; i += 2) {
    knots.push(straightKnot(args[i] ?? 0, args[i + 1] ?? 0, scale));
  }
}

function appendOutgoingControl(prev: BezierKnot, cp1x: number, cp1y: number, scale: PathScale): BezierKnot {
  const newPoints = [...prev.points];

  newPoints[4] = cp1y * scale.scaleY;
  newPoints[5] = cp1x * scale.scaleX;

  return { linked: false, points: newPoints };
}

function applyCurveCommand(args: readonly number[], scale: PathScale, knots: BezierKnot[]): void {
  for (let i = 0; i + 5 < args.length; i += 6) {
    const cp1x = args[i] ?? 0;
    const cp1y = args[i + 1] ?? 0;
    const cp2x = args[i + 2] ?? 0;
    const cp2y = args[i + 3] ?? 0;
    const ex = args[i + 4] ?? 0;
    const ey = args[i + 5] ?? 0;
    const prev = knots[knots.length - 1];

    if (prev) {
      knots[knots.length - 1] = appendOutgoingControl(prev, cp1x, cp1y, scale);
    }

    knots.push({
      linked: false,
      points: [
        cp2y * scale.scaleY,
        cp2x * scale.scaleX,
        ey * scale.scaleY,
        ex * scale.scaleX,
        ey * scale.scaleY,
        ex * scale.scaleX,
      ],
    });
  }
}

/** Convert SVG path data to a PSD BezierPath for vector mask use. */
export function svgPathToPsdVectorMask(d: string, width: number, height: number): BezierPath | null {
  if (!d.trim()) return null;

  const commands = parseSvgPath(d);
  const firstCmd = commands[0];

  if (!firstCmd || (firstCmd.cmd !== 'M' && firstCmd.cmd !== 'm')) return null;

  const scale: PathScale = {
    scaleX: width > 0 ? PSD_COORD_MAX / width : 1,
    scaleY: height > 0 ? PSD_COORD_MAX / height : 1,
  };
  const knots: BezierKnot[] = [];
  let isClosed = false;

  for (const { cmd, args } of commands) {
    if (cmd === 'M') applyMoveCommand(args, scale, knots);
    else if (cmd === 'L') applyLineCommand(args, scale, knots);
    else if (cmd === 'C') applyCurveCommand(args, scale, knots);
    else if (cmd === 'Z' || cmd === 'z') isClosed = true;
  }

  if (knots.length < 2) return null;

  return {
    open: !isClosed,
    knots,
    fillRule: DEFAULT_FILL_RULE,
  };
}

export function buildRoundedRectMask(
  width: number,
  height: number,
  radii: readonly [number, number, number, number],
): BezierPath {
  const [tl, tr, br, bl] = radii;
  const scaleX = PSD_COORD_MAX / width;
  const scaleY = PSD_COORD_MAX / height;
  const knots: BezierKnot[] = [];

  knots.push({ linked: true, points: [0, tl * scaleX, 0, tl * scaleX, 0, tl * scaleX] });
  knots.push({ linked: true, points: [tl * scaleY, 0, tl * scaleY, 0, tl * scaleY, 0] });
  knots.push({
    linked: true,
    points: [(height - bl) * scaleY, 0, (height - bl) * scaleY, 0, (height - bl) * scaleY, 0],
  });
  knots.push({
    linked: true,
    points: [height * scaleY, bl * scaleX, height * scaleY, bl * scaleX, height * scaleY, bl * scaleX],
  });
  knots.push({
    linked: true,
    points: [
      height * scaleY,
      (width - br) * scaleX,
      height * scaleY,
      (width - br) * scaleX,
      height * scaleY,
      (width - br) * scaleX,
    ],
  });
  knots.push({
    linked: true,
    points: [
      (height - br) * scaleY,
      width * scaleX,
      (height - br) * scaleY,
      width * scaleX,
      (height - br) * scaleY,
      width * scaleX,
    ],
  });
  knots.push({
    linked: true,
    points: [tr * scaleY, width * scaleX, tr * scaleY, width * scaleX, tr * scaleY, width * scaleX],
  });
  knots.push({
    linked: true,
    points: [0, (width - tr) * scaleX, 0, (width - tr) * scaleX, 0, (width - tr) * scaleX],
  });

  return { open: false, knots, fillRule: DEFAULT_FILL_RULE };
}
/**
 * Builds a simple rectangle `BezierPath` spanning the element's
 * bounds. Used as the vector mask geometry for native rectangle
 * shape layers — Photoshop reads the rectangle outline from here
 * rather than from `top`/`left`/`right`/`bottom`.
 */
export function buildRectangleMask(width: number, height: number): BezierPath {
  const scaleX = PSD_COORD_MAX / Math.max(1, width);
  const scaleY = PSD_COORD_MAX / Math.max(1, height);
  const knots: BezierKnot[] = [
    { linked: true, points: [0, 0, 0, 0, 0, 0] },
    { linked: true, points: [0, width * scaleX, 0, width * scaleX, 0, width * scaleX] },
    {
      linked: true,
      points: [height * scaleY, width * scaleX, height * scaleY, width * scaleX, height * scaleY, width * scaleX],
    },
    { linked: true, points: [height * scaleY, 0, height * scaleY, 0, height * scaleY, 0] },
  ];

  return { open: false, knots, fillRule: DEFAULT_FILL_RULE };
}

/**
 * Builds a four-anchor cubic-bezier ellipse `BezierPath`. The control-
 * point magic number (≈ `0.5522847498`) is the standard Kappa value
 * for approximating a quarter-circle with a single cubic Bezier.
 */
const ELLIPSE_KAPPA = 0.5522847498307933;

export function buildEllipseMask(width: number, height: number): BezierPath {
  const scaleX = PSD_COORD_MAX / Math.max(1, width);
  const scaleY = PSD_COORD_MAX / Math.max(1, height);
  const rx = width / 2;
  const ry = height / 2;
  const cx = width / 2;
  const cy = height / 2;
  const kx = rx * ELLIPSE_KAPPA;
  const ky = ry * ELLIPSE_KAPPA;

  const knot = (py: number, px: number, inY: number, inX: number, outY: number, outX: number): BezierKnot => ({
    linked: false,
    points: [inY * scaleY, inX * scaleX, py * scaleY, px * scaleX, outY * scaleY, outX * scaleX],
  });

  const knots: BezierKnot[] = [
    // Top anchor
    knot(0, cx, 0, cx - kx, 0, cx + kx),
    // Right anchor
    knot(cy, width, cy - ky, width, cy + ky, width),
    // Bottom anchor
    knot(height, cx, height, cx + kx, height, cx - kx),
    // Left anchor
    knot(cy, 0, cy + ky, 0, cy - ky, 0),
  ];

  return { open: false, knots, fillRule: DEFAULT_FILL_RULE };
}
