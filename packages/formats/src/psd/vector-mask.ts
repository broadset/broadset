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

export function polygonToVectorMask(coords: string, width: number, height: number): BezierPath | null {
  const points = coords.split(',').map((p) => p.trim());
  const knots: BezierKnot[] = [];

  for (const point of points) {
    const parts = point.split(/\s+/);
    const xStr = parts[0];
    const yStr = parts[1];

    if (!xStr || !yStr) continue;

    const x = parseFloat(xStr);
    const y = parseFloat(yStr);

    if (isNaN(x) || isNaN(y)) continue;

    const xScaled = (x / 100) * width;
    const yScaled = (y / 100) * height;
    const sx = PSD_COORD_MAX / width;
    const sy = PSD_COORD_MAX / height;

    knots.push({
      linked: true,
      points: [yScaled * sy, xScaled * sx, yScaled * sy, xScaled * sx, yScaled * sy, xScaled * sx],
    });
  }

  if (knots.length < 3) return null;

  return { open: false, knots, fillRule: DEFAULT_FILL_RULE };
}

export function bezierPathToSvgD(path: BezierPath, width: number, height: number): string | undefined {
  if (path.knots.length < 2) return undefined;

  const parts: string[] = [];
  const PRECEDING_Y = 0;
  const PRECEDING_X = 1;
  const ANCHOR_Y = 2;
  const ANCHOR_X = 3;
  const LEAVING_Y = 4;
  const LEAVING_X = 5;

  const toX = (v: number): number => Math.round((v / PSD_COORD_MAX) * width);
  const toY = (v: number): number => Math.round((v / PSD_COORD_MAX) * height);

  for (let i = 0; i < path.knots.length; i++) {
    const knot = path.knots[i];

    if (!knot) continue;

    const ax = toX(knot.points[ANCHOR_X] ?? 0);
    const ay = toY(knot.points[ANCHOR_Y] ?? 0);

    if (i === 0) {
      parts.push(`M ${String(ax)} ${String(ay)}`);
    } else {
      const prevKnot = path.knots[i - 1];

      if (prevKnot && !knot.linked) {
        const cp1x = toX(prevKnot.points[LEAVING_X] ?? 0);
        const cp1y = toY(prevKnot.points[LEAVING_Y] ?? 0);
        const cp2x = toX(knot.points[PRECEDING_X] ?? 0);
        const cp2y = toY(knot.points[PRECEDING_Y] ?? 0);
        const prevAx = toX(prevKnot.points[ANCHOR_X] ?? 0);
        const prevAy = toY(prevKnot.points[ANCHOR_Y] ?? 0);

        if (cp1x !== prevAx || cp1y !== prevAy || cp2x !== ax || cp2y !== ay) {
          parts.push(`C ${String(cp1x)} ${String(cp1y)} ${String(cp2x)} ${String(cp2y)} ${String(ax)} ${String(ay)}`);
          continue;
        }
      }

      parts.push(`L ${String(ax)} ${String(ay)}`);
    }
  }

  if (!path.open) {
    parts.push('Z');
  }

  return parts.join(' ');
}
