import type { BroadsetColor, ThemeSlot } from '@broadset/model';

import { findChild, findDescendant, findDescendants, getAttr, parseOoxml, rootElement, type XmlElement } from '../ooxml/ast';
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

  const root = rootElement(parseOoxml(xml));

  if (root === null) return map;

  for (const sp of findDescendants(root, 'p:sp')) {
    const placeholder = extractPlaceholder(sp, theme);

    if (placeholder !== null) map.set(placeholder.index, placeholder);
  }

  return map;
}

function extractPlaceholder(spNode: XmlElement, theme: ResolvedTheme): LayoutPlaceholder | null {
  const ph = findDescendant(spNode, 'p:ph');

  if (ph === null) return null;

  const type = getAttr(ph, 'type');
  const index = resolvePlaceholderIndex(ph, type);

  if (index === null) return null;

  const rPrProps = extractRunProps(spNode, theme);

  return {
    index,
    ...(type !== undefined ? { type } : {}),
    ...rPrProps,
  };
}

function resolvePlaceholderIndex(phNode: XmlElement, type: string | undefined): number | null {
  const idx = getAttr(phNode, 'idx');

  if (idx !== undefined) return parseInt(idx, 10);

  return extractPlaceholderIndexFromType(type);
}

function extractRunProps(
  spNode: XmlElement,
  theme: ResolvedTheme,
): {
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly color?: BroadsetColor;
} {
  const rPr = findDescendant(spNode, 'a:rPr');

  if (rPr === null) return {};

  const sz = getAttr(rPr, 'sz');
  const fontSize = sz !== undefined ? parseInt(sz, 10) / 100 : undefined;
  const latin = findChild(rPr, 'a:latin');
  const fontFamily = latin !== null ? getAttr(latin, 'typeface') : undefined;
  const color = extractColorFromRPr(rPr, theme);

  return {
    ...(fontFamily !== undefined ? { fontFamily } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(color !== undefined ? { color } : {}),
  };
}

function extractColorFromRPr(rPrNode: XmlElement, theme: ResolvedTheme): BroadsetColor | undefined {
  const solid = findChild(rPrNode, 'a:solidFill');

  if (solid === null) return undefined;

  const srgb = findChild(solid, 'a:srgbClr');

  if (srgb !== null) {
    const val = getAttr(srgb, 'val');

    if (val !== undefined && /^[0-9A-Fa-f]{6,8}$/.test(val)) {
      const hex: `#${string}` = `#${val.toUpperCase()}`;

      return { kind: 'rgb', hex };
    }
  }

  const scheme = findChild(solid, 'a:schemeClr');

  if (scheme !== null) {
    const slot = getAttr(scheme, 'val') as ThemeSlot | undefined;

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
