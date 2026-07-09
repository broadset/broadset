import type { BroadsetElement, Canvas } from '@broadset/model';
import {
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  type PDFOperator,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';

import { elementToPoints } from '../geometry';
import type { CanvasAbsolutePosition, OperatorBrackets } from './geometry';
import { ROUNDED_RECT_KAPPA } from './rectangle';

const EMPTY_BRACKETS: OperatorBrackets = { start: [], end: [] };

/**
 * Produce PDF clipping-path operator brackets for an element whose
 * `style.customClipPath` is a supported CSS clip-path function. The
 * exporter wraps the element's drawing in:
 *
 * ```
 * q                          (push graphics state)
 *   <clip-path operators>
 *   W                        (clip)
 *   n                        (end path without painting)
 *   … element drawing …
 * Q                          (pop graphics state)
 * ```
 *
 * Supported functions: `inset()`, `circle()`, `ellipse()`, `polygon()`.
 * `path('…')` delegates to the SVG-rasterize fallback in the existing
 * pipeline (so the bracketing helper returns empty sequences). `url(#…)`
 * references are also unsupported here — SVG-clipPath resolution lands
 * with the renderer integration in a later phase.
 */
export function clipPathBrackets(
  element: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  trimHeightPt: number,
): OperatorBrackets {
  const raw = element.style.customClipPath;

  if (raw === undefined || raw.trim() === '') {
    return EMPTY_BRACKETS;
  }

  if (element.style.maskType !== 'custom') {
    return EMPTY_BRACKETS;
  }

  const bleed = canvas.bleed ?? [0, 0, 0, 0];
  const bleedLeftPt = elementToPoints(canvas, bleed[3]);
  const bleedBottomPt = elementToPoints(canvas, bleed[2]);

  const xPt = bleedLeftPt + elementToPoints(canvas, absolute.x);
  const yPt =
    bleedBottomPt + trimHeightPt - elementToPoints(canvas, absolute.y) - elementToPoints(canvas, element.height);
  const wPt = elementToPoints(canvas, element.width);
  const hPt = elementToPoints(canvas, element.height);

  const ops = tryBuildClipOperators(raw.trim(), xPt, yPt, wPt, hPt);

  if (ops === null) {
    return EMPTY_BRACKETS;
  }

  return {
    start: [pushGraphicsState(), ...ops, clip(), endPath()],
    end: [popGraphicsState()],
  };
}

function tryBuildClipOperators(
  source: string,
  xPt: number,
  yPt: number,
  wPt: number,
  hPt: number,
): readonly PDFOperator[] | null {
  const lowered = source.toLowerCase();

  if (lowered.startsWith('inset(')) {
    return buildInsetClip(source, xPt, yPt, wPt, hPt);
  }

  if (lowered.startsWith('circle(')) {
    return buildCircleClip(source, xPt, yPt, wPt, hPt);
  }

  if (lowered.startsWith('ellipse(')) {
    return buildEllipseClip(source, xPt, yPt, wPt, hPt);
  }

  if (lowered.startsWith('polygon(')) {
    return buildPolygonClip(source, xPt, yPt, wPt, hPt);
  }

  if (lowered.startsWith('path(')) {
    // The SVG path d-attribute uses the element's local CSS coord
    // frame (origin top-left, Y down). `buildSvgPathClip` Y-flips
    // against `yBaselinePt` = the PDF-space Y coordinate of the
    // element's top edge, which is `yPt + hPt` in our current
    // bottom-anchored `yPt` variable.
    return buildSvgPathClip(source, xPt, yPt + hPt);
  }

  // `url(#id)` clip-paths reference an external SVG <clipPath> that lives
  // outside the element's own style. Resolving the referenced SVG is an
  // SVG-import concern (P7) rather than a PDF-export concern — recorded
  // as a Spec Gap in `project/spec/formats/pdf.md` §Spec Gaps. Until
  // that lands, `url(#id)` clip-paths fall through to no-clip rather
  // than silently dropping; the element renders unclipped but the rest
  // of its painting sequence is intact.
  return null;
}

/* ------------------------------------------------------------------ */
/*  inset(top [right] [bottom] [left] [round r])                       */
/* ------------------------------------------------------------------ */

function buildInsetClip(
  source: string,
  xPt: number,
  yPt: number,
  wPt: number,
  hPt: number,
): readonly PDFOperator[] | null {
  const body = extractFunctionBody(source, 'inset');

  if (body === null) return null;

  // Strip optional `round <radius…>` clause — per-corner radii on inset()
  // would ship with a wider parity pass; for P6.2 we apply the inset as a
  // sharp rectangle.
  const [spatialPart] = body.split(/\bround\b/i);
  const tokens = tokenise(spatialPart ?? '');

  if (tokens.length === 0) return null;

  const insets = resolveEdgeTuple(tokens, wPt, hPt);

  if (insets === null) return null;

  const [insetTop, insetRight, insetBottom, insetLeft] = insets;

  const left = xPt + insetLeft;
  const right = xPt + wPt - insetRight;
  // PDF Y is up; SVG-style top inset means the clip starts at `y + (h - top)`
  // from the page origin, i.e. subtract the inset from the element's top edge.
  const top = yPt + hPt - insetTop;
  const bottom = yPt + insetBottom;

  if (right <= left || top <= bottom) return null;

  return [moveTo(left, bottom), lineTo(right, bottom), lineTo(right, top), lineTo(left, top), closePath()];
}

/* ------------------------------------------------------------------ */
/*  circle(r [at cx cy])                                               */
/* ------------------------------------------------------------------ */

function buildCircleClip(
  source: string,
  xPt: number,
  yPt: number,
  wPt: number,
  hPt: number,
): readonly PDFOperator[] | null {
  const body = extractFunctionBody(source, 'circle');

  if (body === null) return null;

  const [radiusPart, centerPart] = body.split(/\bat\b/i);
  const radiusTokens = tokenise(radiusPart ?? '');

  if (radiusTokens.length === 0) return null;

  const referenceForRadius = Math.sqrt(wPt * wPt + hPt * hPt) / Math.sqrt(2);
  const radius = resolveLength(radiusTokens[0] ?? '', referenceForRadius);

  if (radius === null || radius <= 0) return null;

  const [cxRaw, cyRaw] = tokenise(centerPart ?? '');
  const cxCanvas = cxRaw === undefined ? wPt / 2 : (resolveLength(cxRaw, wPt) ?? wPt / 2);
  const cyCanvas = cyRaw === undefined ? hPt / 2 : (resolveLength(cyRaw, hPt) ?? hPt / 2);
  // CSS Y grows downward within the element box; flip into PDF Y-up.
  const cxPt = xPt + cxCanvas;
  const cyPt = yPt + hPt - cyCanvas;

  return buildEllipseOperators(cxPt, cyPt, radius, radius);
}

/* ------------------------------------------------------------------ */
/*  ellipse(rx ry [at cx cy])                                          */
/* ------------------------------------------------------------------ */

function buildEllipseClip(
  source: string,
  xPt: number,
  yPt: number,
  wPt: number,
  hPt: number,
): readonly PDFOperator[] | null {
  const body = extractFunctionBody(source, 'ellipse');

  if (body === null) return null;

  const [radiiPart, centerPart] = body.split(/\bat\b/i);
  const radiiTokens = tokenise(radiiPart ?? '');

  if (radiiTokens.length < 2) return null;

  const rx = resolveLength(radiiTokens[0] ?? '', wPt);
  const ry = resolveLength(radiiTokens[1] ?? '', hPt);

  if (rx === null || ry === null || rx <= 0 || ry <= 0) return null;

  const [cxRaw, cyRaw] = tokenise(centerPart ?? '');
  const cxCanvas = cxRaw === undefined ? wPt / 2 : (resolveLength(cxRaw, wPt) ?? wPt / 2);
  const cyCanvas = cyRaw === undefined ? hPt / 2 : (resolveLength(cyRaw, hPt) ?? hPt / 2);
  const cxPt = xPt + cxCanvas;
  const cyPt = yPt + hPt - cyCanvas;

  return buildEllipseOperators(cxPt, cyPt, rx, ry);
}

function buildEllipseOperators(cx: number, cy: number, rx: number, ry: number): readonly PDFOperator[] {
  const k = ROUNDED_RECT_KAPPA;
  const ox = rx * k;
  const oy = ry * k;

  return [
    moveTo(cx - rx, cy),
    // Top half-ellipse, starting at the left vertex going clockwise through the top.
    appendBezierCurve(cx - rx, cy + oy, cx - ox, cy + ry, cx, cy + ry),
    appendBezierCurve(cx + ox, cy + ry, cx + rx, cy + oy, cx + rx, cy),
    // Bottom half-ellipse.
    appendBezierCurve(cx + rx, cy - oy, cx + ox, cy - ry, cx, cy - ry),
    appendBezierCurve(cx - ox, cy - ry, cx - rx, cy - oy, cx - rx, cy),
    closePath(),
  ];
}

/* ------------------------------------------------------------------ */
/*  polygon(x1 y1, x2 y2, …)                                           */
/* ------------------------------------------------------------------ */

function buildPolygonClip(
  source: string,
  xPt: number,
  yPt: number,
  wPt: number,
  hPt: number,
): readonly PDFOperator[] | null {
  const body = extractFunctionBody(source, 'polygon');

  if (body === null) return null;

  // Strip optional `evenodd` / `nonzero` fill-rule prefix.
  const normalized = body.replace(/^\s*(?:evenodd|nonzero)\s*,\s*/i, '');
  const pointsRaw = normalized.split(',');

  const points: (readonly [number, number])[] = [];

  for (const raw of pointsRaw) {
    const tokens = tokenise(raw);

    if (tokens.length < 2) return null;

    const x = resolveLength(tokens[0] ?? '', wPt);
    const y = resolveLength(tokens[1] ?? '', hPt);

    if (x === null || y === null) return null;

    const absX = xPt + x;
    const absY = yPt + hPt - y;

    points.push([absX, absY]);
  }

  if (points.length < 3) return null;

  const [first, ...rest] = points;

  if (first === undefined) return null;

  const ops: PDFOperator[] = [moveTo(first[0], first[1])];

  for (const [x, y] of rest) {
    ops.push(lineTo(x, y));
  }

  ops.push(closePath());

  return ops;
}

/* ------------------------------------------------------------------ */
/*  path('d') — minimal SVG-command clip                               */
/* ------------------------------------------------------------------ */

interface SvgPathState {
  cursorX: number;
  cursorY: number;
  subpathStartX: number;
  subpathStartY: number;
}

interface SvgCommandToken {
  readonly cmd: string;
  readonly rawArgs: string;
}

function buildSvgPathClip(source: string, xPt: number, yBaselinePt: number): readonly PDFOperator[] | null {
  const body = extractFunctionBody(source, 'path');

  if (body === null) return null;

  const stripped = body
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  const ops: PDFOperator[] = [];
  const state: SvgPathState = { cursorX: 0, cursorY: 0, subpathStartX: 0, subpathStartY: 0 };

  for (const token of collectSvgCommandTokens(stripped)) {
    const args = parseNumberSequence(token.rawArgs);
    const emitted = dispatchSvgCommand(token.cmd, args, state, xPt, yBaselinePt);

    if (emitted === null) return null;

    ops.push(...emitted);
  }

  return ops.length > 0 ? ops : null;
}

function collectSvgCommandTokens(source: string): readonly SvgCommandToken[] {
  const commandRe = /([MmLlHhVvCcZz])\s*([^MmLlHhVvCcZz]*)/g;
  const tokens: SvgCommandToken[] = [];
  let match: RegExpExecArray | null;

  while ((match = commandRe.exec(source)) !== null) {
    const cmd = match[1];
    const rawArgs = match[2];

    if (cmd !== undefined && rawArgs !== undefined) tokens.push({ cmd, rawArgs });
  }

  return tokens;
}

function dispatchSvgCommand(
  cmd: string,
  args: readonly number[],
  state: SvgPathState,
  xPt: number,
  yBaselinePt: number,
): readonly PDFOperator[] | null {
  const isRelative = cmd >= 'a' && cmd <= 'z';

  switch (cmd.toUpperCase()) {
    case 'M':
      return handleMoveOrLine(args, state, xPt, yBaselinePt, isRelative, true);
    case 'L':
      return handleMoveOrLine(args, state, xPt, yBaselinePt, isRelative, false);
    case 'H':
      return handleHorizontal(args, state, xPt, yBaselinePt, isRelative);
    case 'V':
      return handleVertical(args, state, xPt, yBaselinePt, isRelative);
    case 'C':
      return handleCubic(args, state, xPt, yBaselinePt, isRelative);
    case 'Z':
      return handleClose(state);
    default:
      // Q / T / A / S paths are not yet supported; rather than
      // silently dropping the clip we signal failure and the caller
      // falls through to no-clip. Documented as a Spec Gap.
      return null;
  }
}

function handleMoveOrLine(
  args: readonly number[],
  state: SvgPathState,
  xPt: number,
  yBaselinePt: number,
  isRelative: boolean,
  isMove: boolean,
): readonly PDFOperator[] | null {
  if (args.length < 2) return null;

  const targetX = isRelative ? state.cursorX + (args[0] ?? 0) : (args[0] ?? 0);
  const targetY = isRelative ? state.cursorY + (args[1] ?? 0) : (args[1] ?? 0);

  state.cursorX = targetX;
  state.cursorY = targetY;

  if (isMove) {
    state.subpathStartX = targetX;
    state.subpathStartY = targetY;

    return [moveTo(xPt + targetX, yBaselinePt - targetY)];
  }

  return [lineTo(xPt + targetX, yBaselinePt - targetY)];
}

function handleHorizontal(
  args: readonly number[],
  state: SvgPathState,
  xPt: number,
  yBaselinePt: number,
  isRelative: boolean,
): readonly PDFOperator[] | null {
  if (args.length < 1) return null;

  const targetX = isRelative ? state.cursorX + (args[0] ?? 0) : (args[0] ?? 0);

  state.cursorX = targetX;

  return [lineTo(xPt + targetX, yBaselinePt - state.cursorY)];
}

function handleVertical(
  args: readonly number[],
  state: SvgPathState,
  xPt: number,
  yBaselinePt: number,
  isRelative: boolean,
): readonly PDFOperator[] | null {
  if (args.length < 1) return null;

  const targetY = isRelative ? state.cursorY + (args[0] ?? 0) : (args[0] ?? 0);

  state.cursorY = targetY;

  return [lineTo(xPt + state.cursorX, yBaselinePt - targetY)];
}

function handleCubic(
  args: readonly number[],
  state: SvgPathState,
  xPt: number,
  yBaselinePt: number,
  isRelative: boolean,
): readonly PDFOperator[] | null {
  if (args.length < 6) return null;

  const ox = isRelative ? state.cursorX : 0;
  const oy = isRelative ? state.cursorY : 0;
  const c1x = ox + (args[0] ?? 0);
  const c1y = oy + (args[1] ?? 0);
  const c2x = ox + (args[2] ?? 0);
  const c2y = oy + (args[3] ?? 0);
  const endX = ox + (args[4] ?? 0);
  const endY = oy + (args[5] ?? 0);

  state.cursorX = endX;
  state.cursorY = endY;

  return [
    appendBezierCurve(xPt + c1x, yBaselinePt - c1y, xPt + c2x, yBaselinePt - c2y, xPt + endX, yBaselinePt - endY),
  ];
}

function handleClose(state: SvgPathState): readonly PDFOperator[] {
  state.cursorX = state.subpathStartX;
  state.cursorY = state.subpathStartY;

  return [closePath()];
}

function parseNumberSequence(source: string): readonly number[] {
  const result: number[] = [];
  const numberRe = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

  let match: RegExpExecArray | null;

  while ((match = numberRe.exec(source)) !== null) {
    const token = match[0];
    const n = Number.parseFloat(token);

    if (Number.isFinite(n)) result.push(n);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Token + length helpers                                             */
/* ------------------------------------------------------------------ */

function extractFunctionBody(source: string, name: string): string | null {
  const open = source.toLowerCase().indexOf(`${name}(`);

  if (open < 0) return null;

  const start = open + name.length + 1;
  const end = source.lastIndexOf(')');

  if (end <= start) return null;

  return source.slice(start, end).trim();
}

function tokenise(source: string): readonly string[] {
  return source
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Resolve a CSS length token (`10px`, `25%`, `12pt`) to a numeric value
 * in PDF points. Percentages are resolved against `reference` — typically
 * the width or height of the element's box. Returns `null` for tokens
 * that cannot be parsed.
 */
function resolveLength(token: string, reference: number): number | null {
  const match = /^(-?\d+(?:\.\d+)?)(%|px|pt)?$/.exec(token.trim());

  if (match === null) return null;

  const rawNumber = match[1];

  if (rawNumber === undefined) return null;

  const numeric = Number.parseFloat(rawNumber);

  if (!Number.isFinite(numeric)) return null;

  const unit = match[2];

  if (unit === '%') {
    return (numeric / 100) * reference;
  }

  // `pt` tokens pass through directly; `px` approximates 1:1 with PDF points
  // for screen-scale content. Absolute conversions per CSS spec (1in = 96px)
  // land with the colour / font / gamut work in later phases.
  return numeric;
}

/**
 * Expand a CSS inset() edge tuple (one to four tokens) into explicit
 * `[top, right, bottom, left]` values resolved against the element box.
 * Returns `null` when any token is unparseable.
 */
function resolveEdgeTuple(
  tokens: readonly string[],
  widthRef: number,
  heightRef: number,
): readonly [number, number, number, number] | null {
  const top = resolveLength(tokens[0] ?? '', heightRef);
  const right = resolveLength(tokens[1] ?? tokens[0] ?? '', widthRef);
  const bottom = resolveLength(tokens[2] ?? tokens[0] ?? '', heightRef);
  const left = resolveLength(tokens[3] ?? tokens[1] ?? tokens[0] ?? '', widthRef);

  if (top === null || right === null || bottom === null || left === null) {
    return null;
  }

  return [top, right, bottom, left];
}
