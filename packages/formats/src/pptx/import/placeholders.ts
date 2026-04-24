import type { BroadsetColor, ThemeSlot } from '@broadset/model';

import type { LayoutPlaceholder, ResolvedTheme } from '../types';

/**
 * Placeholder inheritance — the slide layout (and, transitively, the
 * slide master) defines default text properties per placeholder
 * `idx`. Slide shapes with `<p:ph idx="N" />` inherit from the same
 * `idx` when their own `<a:rPr>` omits a property.
 *
 * This module walks a layout / master XML and returns a map of
 * placeholder index → `LayoutPlaceholder` with the resolved font
 * family, size, and colour. The colour resolution can reference the
 * theme palette (via `<a:schemeClr>`); the caller passes a
 * `ResolvedTheme` for that.
 */

export function parseLayoutPlaceholders(xml: string | null, theme: ResolvedTheme): ReadonlyMap<number, LayoutPlaceholder> {
  const map = new Map<number, LayoutPlaceholder>();

  if (xml === null || xml.length === 0) return map;

  for (const match of xml.matchAll(/<p:sp\b([\s\S]*?)<\/p:sp>/g)) {
    const body = match[1] ?? '';
    const placeholder = extractPlaceholder(body, theme);

    if (placeholder !== null) map.set(placeholder.index, placeholder);
  }

  return map;
}

function extractPlaceholder(body: string, theme: ResolvedTheme): LayoutPlaceholder | null {
  const phMatch = body.match(/<p:ph\b([^/>]*)\/?\s*>/);

  if (!phMatch) return null;

  const phAttrs = phMatch[1] ?? '';
  const typeAttr = phAttrs.match(/\btype="([^"]+)"/);
  const index = resolvePlaceholderIndex(phAttrs, typeAttr?.[1]);

  if (index === null) return null;

  const rPrProps = extractRunProps(body, theme);

  return {
    index,
    ...(typeAttr?.[1] !== undefined ? { type: typeAttr[1] } : {}),
    ...rPrProps,
  };
}

function resolvePlaceholderIndex(phAttrs: string, type: string | undefined): number | null {
  const idxAttr = phAttrs.match(/\bidx="(\d+)"/);

  if (idxAttr !== null) return parseInt(idxAttr[1] ?? '0', 10);

  return extractPlaceholderIndexFromType(type);
}

function extractRunProps(
  body: string,
  theme: ResolvedTheme,
): {
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly color?: BroadsetColor;
} {
  const rPr = body.match(/<a:rPr\b([^/>]*)(\/>|>[\s\S]*?<\/a:rPr>)/);

  if (!rPr) return {};

  const rPrAttrs = rPr[1] ?? '';
  const rPrBody = rPr[0];
  const szAttr = rPrAttrs.match(/\bsz="(\d+)"/);
  const fontSize = szAttr !== null ? parseInt(szAttr[1] ?? '0', 10) / 100 : undefined;
  const latinMatch = rPrBody.match(/<a:latin\s+typeface="([^"]+)"/);
  const fontFamily = latinMatch?.[1];
  const color = extractColorFromRPr(rPrBody, theme);

  return {
    ...(fontFamily !== undefined ? { fontFamily } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(color !== undefined ? { color } : {}),
  };
}

function extractColorFromRPr(rPrBody: string, theme: ResolvedTheme): BroadsetColor | undefined {
  const solid = rPrBody.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/);

  if (!solid) return undefined;

  const block = solid[0];
  const srgb = block.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6,8})"/);

  if (srgb !== null) {
    const digits = (srgb[1] ?? '').toUpperCase();
    const hex: `#${string}` = `#${digits}`;

    return { kind: 'rgb', hex };
  }

  const scheme = block.match(/<a:schemeClr\s+val="([a-zA-Z0-9]+)"/);

  if (scheme !== null) {
    const slot = scheme[1] as ThemeSlot | undefined;

    if (slot !== undefined && slot in theme.palette) {
      return { kind: 'rgb', hex: theme.palette[slot] as `#${string}` };
    }
  }

  return undefined;
}

function extractPlaceholderIndexFromType(type: string | undefined): number | null {
  // OOXML conventions: `title`/`ctrTitle` = index 0, `body` = index 1
  // when not otherwise specified. A missing idx attribute with a known
  // type still maps to a stable slot.
  if (type === undefined) return null;
  if (type === 'title' || type === 'ctrTitle') return 0;
  if (type === 'body') return 1;

  return null;
}

/**
 * Merge the slide's shape attributes with a layout placeholder's
 * defaults. Returns a new object with the merged values, favouring
 * slide-side values when both sides specify the property.
 */
export function mergePlaceholderInheritance(
  slideValues: {
    readonly fontFamily?: string | undefined;
    readonly fontSize?: number | undefined;
    readonly color?: BroadsetColor | undefined;
  },
  layoutPlaceholder: LayoutPlaceholder | undefined,
): {
  readonly fontFamily?: string | undefined;
  readonly fontSize?: number | undefined;
  readonly color?: BroadsetColor | undefined;
} {
  if (layoutPlaceholder === undefined) return slideValues;

  return {
    fontFamily: slideValues.fontFamily ?? layoutPlaceholder.fontFamily,
    fontSize: slideValues.fontSize ?? layoutPlaceholder.fontSize,
    color: slideValues.color ?? layoutPlaceholder.color,
  };
}
