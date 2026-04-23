export interface TrimPathAttributes {
  readonly dasharray: string;
  readonly dashoffset: string;
}

/**
 * Compute `stroke-dasharray` and `stroke-dashoffset` SVG attributes from
 * trim-path fractions. Returns `null` when trim values are at their defaults
 * (full stroke visible) so callers can skip attribute application entirely.
 */
export function computeTrimPathAttributes(
  totalLength: number,
  trimStart: number,
  trimEnd: number,
  trimOffset: number,
): TrimPathAttributes | null {
  if (totalLength <= 0 || (trimStart === 0 && trimEnd === 1 && trimOffset === 0)) {
    return null;
  }

  const visibleFraction = Math.max(0, trimEnd - trimStart);
  const visibleLength = visibleFraction * totalLength;

  if (visibleLength <= 0) {
    return { dasharray: `0 ${String(totalLength)}`, dashoffset: '0' };
  }

  const gapLength = totalLength - visibleLength;
  const offsetLength = (trimStart + trimOffset) * totalLength;

  return {
    dasharray: `${String(visibleLength)} ${String(gapLength)}`,
    dashoffset: String(-offsetLength),
  };
}
