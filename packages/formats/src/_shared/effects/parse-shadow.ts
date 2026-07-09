import { parseHexColor } from './parse-color';
import type { ParsedShadow } from './types';

// Shared regex fragments. Composed via template strings so each
// individual expression stays under sonarjs/regex-complexity (default 20).
const SIGNED_PX = String.raw`(-?\d+(?:\.\d+)?)px`;
const RGBA_BODY = String.raw`rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)`;
const SHADOW_OFFSETS = `${SIGNED_PX}\\s+${SIGNED_PX}\\s+${SIGNED_PX}(?:\\s+${SIGNED_PX})?`;

const SHADOW_RGBA_RE = new RegExp(`${SHADOW_OFFSETS}\\s+${RGBA_BODY}`);
const SHADOW_HEX_RE = new RegExp(`${SHADOW_OFFSETS}\\s+(#[\\da-fA-F]{3,8})`);

/**
 * Parse a single CSS `box-shadow` value (one shadow, not a list) into
 * a structured descriptor: `<offsetX>px <offsetY>px <blur>px [<spread>px] <color>`,
 * with optional leading `inset`. The colour leg accepts hex
 * (`#rgb` / `#rrggbb` / `#rrggbbaa`) or `rgb()` / `rgba()`.
 *
 * Returns `undefined` for unparseable input. Format-specific exporters
 * map the descriptor onto their own primitive (PSD layer effect,
 * SVG `<feDropShadow>`, PDF `/ExtGState`).
 */
export function parseBoxShadow(shadow: string): ParsedShadow | undefined {
  const trimmed = shadow.trim();
  const inset = trimmed.startsWith('inset');
  const body = inset ? trimmed.replace(/^inset\s+/, '') : trimmed;

  const rgbaMatch = SHADOW_RGBA_RE.exec(body);

  if (rgbaMatch) {
    return {
      offsetX: parseFloat(rgbaMatch[1] ?? '0'),
      offsetY: parseFloat(rgbaMatch[2] ?? '0'),
      blur: parseFloat(rgbaMatch[3] ?? '0'),
      spread: parseFloat(rgbaMatch[4] ?? '0'),
      color: {
        r: parseInt(rgbaMatch[5] ?? '0', 10),
        g: parseInt(rgbaMatch[6] ?? '0', 10),
        b: parseInt(rgbaMatch[7] ?? '0', 10),
        a: parseFloat(rgbaMatch[8] ?? '1'),
      },
      inset,
    };
  }

  const hexMatch = SHADOW_HEX_RE.exec(body);

  if (hexMatch) {
    const color = parseHexColor(hexMatch[5] ?? '#000000');

    return {
      offsetX: parseFloat(hexMatch[1] ?? '0'),
      offsetY: parseFloat(hexMatch[2] ?? '0'),
      blur: parseFloat(hexMatch[3] ?? '0'),
      spread: parseFloat(hexMatch[4] ?? '0'),
      color: color ?? { r: 0, g: 0, b: 0, a: 1 },
      inset,
    };
  }

  return undefined;
}
