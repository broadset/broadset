/**
 * @module psd-path
 * @description SVG path data → PSD BezierPath vector mask conversion.
 */
import type { BezierKnot, BezierPath } from 'ag-psd';

// ---------------------------------------------------------------------------
// SVG Path → PSD Vector Mask
// ---------------------------------------------------------------------------

interface SvgCommand {
  readonly type: string;
  readonly values: readonly number[];
}

/** Parse SVG path data string into commands. */
function parseSvgPathCommands(d: string): readonly SvgCommand[] {
  const commands: SvgCommand[] = [];
  const re = /([MLCSQZmlcsqz])([^MLCSQZmlcsqz]*)/g;
  let match = re.exec(d);

  while (match !== null) {
    const type = match[1] ?? '';
    const argsStr = (match[2] ?? '').trim();
    const values = argsStr.length > 0 ? argsStr.split(/[\s,]+/).map((s) => parseFloat(s)) : [];

    commands.push({ type, values });
    match = re.exec(d);
  }

  return commands;
}

/**
 * Convert SVG path data to a PSD BezierPath.
 *
 * @param pathData - SVG path d attribute value
 * @param width - Element width in mm (used for coordinate normalization)
 * @param height - Element height in mm (used for coordinate normalization)
 * @returns BezierPath or null if conversion fails
 */
export function svgPathToPsdVectorMask(pathData: string, width: number, height: number): BezierPath | null {
  if (!pathData || pathData.trim().length === 0) {
    return null;
  }

  const commands = parseSvgPathCommands(pathData);

  if (commands.length === 0) {
    return null;
  }

  const firstCmd = commands[0];

  if (!firstCmd || (firstCmd.type !== 'M' && firstCmd.type !== 'm')) {
    return null;
  }

  const knots: BezierKnot[] = [];
  let closed = false;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': {
        const mx = cmd.values[0] ?? 0;
        const my = cmd.values[1] ?? 0;

        const mny = my / height;
        const mnx = mx / width;

        knots.push({
          linked: true,
          points: [mny, mnx, mny, mnx, mny, mnx],
        });
        break;
      }

      case 'L': {
        const lx = cmd.values[0] ?? 0;
        const ly = cmd.values[1] ?? 0;

        const lny = ly / height;
        const lnx = lx / width;

        knots.push({
          linked: true,
          points: [lny, lnx, lny, lnx, lny, lnx],
        });
        break;
      }

      case 'C': {
        const cp1x = (cmd.values[0] ?? 0) / width;
        const cp1y = (cmd.values[1] ?? 0) / height;
        const cp2x = (cmd.values[2] ?? 0) / width;
        const cp2y = (cmd.values[3] ?? 0) / height;
        const endX = cmd.values[4] ?? 0;
        const endY = cmd.values[5] ?? 0;

        // Update the leaving control point of the previous knot
        if (knots.length > 0) {
          const prevKnot = knots[knots.length - 1];

          if (prevKnot) {
            prevKnot.points[4] = cp1y;
            prevKnot.points[5] = cp1x;
          }
        }

        const cny = endY / height;
        const cnx = endX / width;

        knots.push({
          linked: false,
          points: [cp2y, cp2x, cny, cnx, cny, cnx],
        });
        break;
      }

      case 'Z':

      // falls through
      case 'z': {
        closed = true;
        break;
      }

      default:
        // Unsupported command — fail gracefully
        return null;
    }
  }

  if (knots.length === 0) {
    return null;
  }

  return {
    open: !closed,
    knots,
    fillRule: 'even-odd',
  };
}
