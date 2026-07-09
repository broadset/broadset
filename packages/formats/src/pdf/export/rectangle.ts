/**
 * Circular-arc cubic-Bezier approximation constant. A single cubic whose
 * control points lie at distance `r * KAPPA` from the endpoints (and
 * perpendicular to the radii) approximates a quarter-circle of radius r
 * to within ~0.0003 units — good enough for graphics output where the
 * downstream rasterizer works in integer pixels.
 *
 * Reference: https://pomax.github.io/bezierinfo/#circles_cubic
 */
export const ROUNDED_RECT_KAPPA = 0.5522847498307936;

/**
 * Per-corner radius tuple ordered `[topLeft, topRight, bottomRight, bottomLeft]`
 * — matching the `BroadsetElementStyle.borderRadius` tuple ordering in
 * `@broadset/model/style.ts`.
 */
export type CornerRadii = readonly [
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
];

/**
 * Build an SVG path string describing a rounded rectangle with possibly
 * non-uniform per-corner radii. The path is emitted in SVG-coordinate
 * space (origin at the top-left of the rectangle, Y growing downward) so
 * `pdf-lib`'s `drawSvgPath` — which already performs the PDF Y-flip — can
 * consume it directly.
 *
 * Each corner is approximated with a single cubic Bezier per the kappa
 * constant. Radii are clamped so adjacent corner arcs never cross (the
 * sum of any two adjacent radii along an edge cannot exceed that edge's
 * length).
 *
 * @param width - Rectangle width in local units (PDF points).
 * @param height - Rectangle height in local units (PDF points).
 * @param radii - Per-corner radii in the same units as `width` / `height`.
 */
export function buildRoundedRectPath(width: number, height: number, radii: CornerRadii): string {
  const clamped = clampRadii(width, height, radii);
  const [tl, tr, br, bl] = clamped;

  const k = ROUNDED_RECT_KAPPA;
  const parts: string[] = [];

  // Start at top-left corner's end (after the rounded arc).
  parts.push(`M ${fmt(tl)} 0`);

  // Top edge to the start of the top-right rounded corner.
  parts.push(`L ${fmt(width - tr)} 0`);
  // Top-right corner: quarter-circle from (w - tr, 0) to (w, tr).
  parts.push(
    `C ${fmt(width - tr + tr * k)} 0 ${fmt(width)} ${fmt(tr - tr * k)} ${fmt(width)} ${fmt(tr)}`,
  );

  // Right edge to the start of the bottom-right rounded corner.
  parts.push(`L ${fmt(width)} ${fmt(height - br)}`);
  // Bottom-right corner: quarter-circle from (w, h - br) to (w - br, h).
  parts.push(
    `C ${fmt(width)} ${fmt(height - br + br * k)} ${fmt(width - br + br * k)} ${fmt(height)} ${fmt(width - br)} ${fmt(height)}`,
  );

  // Bottom edge to the start of the bottom-left rounded corner.
  parts.push(`L ${fmt(bl)} ${fmt(height)}`);
  // Bottom-left corner: quarter-circle from (bl, h) to (0, h - bl).
  parts.push(
    `C ${fmt(bl - bl * k)} ${fmt(height)} 0 ${fmt(height - bl + bl * k)} 0 ${fmt(height - bl)}`,
  );

  // Left edge to the start of the top-left rounded corner.
  parts.push(`L 0 ${fmt(tl)}`);
  // Top-left corner: quarter-circle from (0, tl) to (tl, 0).
  parts.push(`C 0 ${fmt(tl - tl * k)} ${fmt(tl - tl * k)} 0 ${fmt(tl)} 0`);

  parts.push('Z');

  return parts.join(' ');
}

/**
 * Returns `true` when at least one radius is strictly positive (the
 * rectangle needs the path-based output), `false` when every radius is
 * zero / absent (fast `drawRectangle` path is safe).
 */
export function hasAnyRoundedCorner(radii: CornerRadii | undefined): boolean {
  if (radii === undefined) return false;

  return radii.some((r) => r > 0);
}

/**
 * Scale radii so that the sum of any two adjacent corners never exceeds
 * the edge they share — preventing crossing arcs on narrow rectangles.
 * Mirrors the CSS `border-radius` clamping algorithm.
 */
function clampRadii(width: number, height: number, radii: CornerRadii): CornerRadii {
  const [tl, tr, br, bl] = radii;

  const topSum = tl + tr;
  const rightSum = tr + br;
  const bottomSum = br + bl;
  const leftSum = bl + tl;

  const scaleTop = topSum > width ? width / topSum : 1;
  const scaleRight = rightSum > height ? height / rightSum : 1;
  const scaleBottom = bottomSum > width ? width / bottomSum : 1;
  const scaleLeft = leftSum > height ? height / leftSum : 1;

  const scale = Math.min(scaleTop, scaleRight, scaleBottom, scaleLeft, 1);

  return [tl * scale, tr * scale, br * scale, bl * scale];
}

/**
 * Format a number for inclusion in an SVG path `d` attribute. Drops the
 * exponent notation, trims trailing zeros for readability, and keeps up
 * to six significant decimals (beyond that PDF rasterizers see no
 * visible improvement in a ≤ 1em corner arc).
 */
function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0';

  const rounded = Math.round(value * 1_000_000) / 1_000_000;

  return String(rounded);
}
