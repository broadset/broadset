import type { ThemeSlot } from '@broadset/model';

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

const SLOT_TAGS: readonly (readonly [ThemeSlot, string])[] = [
  ['dk1', 'dk1'],
  ['lt1', 'lt1'],
  ['dk2', 'dk2'],
  ['lt2', 'lt2'],
  ['accent1', 'accent1'],
  ['accent2', 'accent2'],
  ['accent3', 'accent3'],
  ['accent4', 'accent4'],
  ['accent5', 'accent5'],
  ['accent6', 'accent6'],
  ['hlink', 'hlink'],
  ['folHlink', 'folHlink'],
];

export function parseTheme(xml: string | null): ResolvedTheme {
  const palette: Record<ThemeSlot, string> = { ...DEFAULT_PALETTE };

  if (xml === null || xml.length === 0) {
    return { palette };
  }

  for (const [slot, tag] of SLOT_TAGS) {
    const value = extractSlotColor(xml, tag);

    if (value !== null) palette[slot] = value;
  }

  return { palette };
}

function extractSlotColor(xml: string, tag: string): string | null {
  const open = new RegExp(`<a:${tag}\\b[^>]*>`, 'i');
  const match = xml.match(open);

  if (!match) return null;

  const startIdx = match.index ?? 0;
  const close = `</a:${tag}>`;
  const endIdx = xml.indexOf(close, startIdx);

  if (endIdx < 0) return null;

  const block = xml.slice(startIdx, endIdx);

  return readColourFromBlock(block);
}

function readColourFromBlock(block: string): string | null {
  const srgb = block.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/);

  if (srgb) return `#${srgb[1]?.toUpperCase() ?? ''}`;

  const sys = block.match(/<a:sysClr\b[^>]*\blastClr="([0-9A-Fa-f]{6})"/);

  if (sys) return `#${sys[1]?.toUpperCase() ?? ''}`;

  return null;
}
