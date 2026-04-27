import type { ThemeSlot } from '@broadset/model';

import { findChild, findDescendant, findDescendants, getAttr, parseOoxml, rootElement, type XmlElement } from '../ooxml/ast';
import type { ResolvedTheme } from '../types';

/**
 * Theme parser — extracts the 12-slot colour scheme from `theme1.xml`.
 *
 * Handles both `<a:srgbClr val="HEX"/>` (direct hex) and
 * `<a:sysClr lastClr="HEX"/>` (system colour with a cached last-seen
 * resolved value — the cached value is what we want).
 *
 * Returns a palette with sensible sRGB defaults for any slot the theme
 * doesn't declare so downstream colour resolution always has a value
 * to work with.
 */

const DEFAULT_PALETTE: Readonly<Record<ThemeSlot, string>> = {
  dk1: '#000000',
  lt1: '#FFFFFF',
  dk2: '#1F1F1F',
  lt2: '#EDEDED',
  accent1: '#4472C4',
  accent2: '#ED7D31',
  accent3: '#A5A5A5',
  accent4: '#FFC000',
  accent5: '#5B9BD5',
  accent6: '#70AD47',
  hlink: '#0563C1',
  folHlink: '#954F72',
};

const THEME_SLOTS: readonly ThemeSlot[] = [
  'dk1', 'lt1', 'dk2', 'lt2',
  'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
  'hlink', 'folHlink',
];

export function parseTheme(xml: string | null): ResolvedTheme {
  const palette: Record<ThemeSlot, string> = { ...DEFAULT_PALETTE };

  if (xml === null || xml.length === 0) return { palette };

  const root = rootElement(parseOoxml(xml));

  if (root === null) return { palette };

  // Theme structure: <a:theme><a:themeElements><a:clrScheme><a:dk1>…</a:clrScheme>…</a:theme>
  const clrScheme = findDescendant(root, 'a:clrScheme');

  if (clrScheme === null) return { palette };

  for (const slot of THEME_SLOTS) {
    const slotNode = findChild(clrScheme, `a:${slot}`);

    if (slotNode === null) continue;

    const colour = readSlotColour(slotNode);

    if (colour !== null) palette[slot] = colour;
  }

  return { palette };
}

/**
 * Read the colour out of a single `<a:dk1>` / `<a:accent1>` etc. block.
 * Children may be `<a:srgbClr val="HEX"/>` or `<a:sysClr lastClr="HEX"/>`;
 * the importer prefers either over the unresolved system colour.
 */
function readSlotColour(slotNode: XmlElement): string | null {
  for (const child of findDescendants(slotNode, 'a:srgbClr')) {
    const val = getAttr(child, 'val');

    if (val !== undefined && /^[0-9A-Fa-f]{6}$/.test(val)) {
      return `#${val.toUpperCase()}`;
    }
  }

  for (const child of findDescendants(slotNode, 'a:sysClr')) {
    const lastClr = getAttr(child, 'lastClr');

    if (lastClr !== undefined && /^[0-9A-Fa-f]{6}$/.test(lastClr)) {
      return `#${lastClr.toUpperCase()}`;
    }
  }

  return null;
}
