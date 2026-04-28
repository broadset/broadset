import type { ParsedGlow } from './types';

const RGBA_BODY = String.raw`rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)`;
const FILTER_GLOW_RE = new RegExp(String.raw`drop-shadow\(\s*0\s+0\s+(\d+(?:\.\d+)?)px\s+${RGBA_BODY}\s*\)`);

/**
 * Extract the blur radius and colour from a CSS `filter:
 * drop-shadow(0 0 <blur>px <color>)` value — i.e. an outer-glow
 * shorthand. Asymmetric drop shadows (non-zero offsets) parse via
 * {@link parseBoxShadow}; this entry exists for the glow-only shape
 * formats need to map onto outer-glow primitives.
 *
 * Returns `undefined` for unparseable input.
 */
export function parseFilterGlow(filter: string): ParsedGlow | undefined {
  const match = FILTER_GLOW_RE.exec(filter);

  if (!match) {
    return undefined;
  }

  return {
    blur: parseFloat(match[1] ?? '0'),
    color: {
      r: parseInt(match[2] ?? '0', 10),
      g: parseInt(match[3] ?? '0', 10),
      b: parseInt(match[4] ?? '0', 10),
      a: parseFloat(match[5] ?? '1'),
    },
  };
}
