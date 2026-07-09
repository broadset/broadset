import { type OoxmlPackage,readTextPart } from '../ooxml/zip';
import type { LayoutPlaceholder } from '../types';
import { findMasterPaths } from './master';
import { parseLayoutPlaceholders } from './placeholders';

export function aggregateLayoutPlaceholders(
  pkg: OoxmlPackage,
  layoutPaths: readonly string[],
  theme: Parameters<typeof parseLayoutPlaceholders>[1],
): ReadonlyMap<number, LayoutPlaceholder> {
  const aggregated = new Map<number, LayoutPlaceholder>();

  for (const layoutPath of layoutPaths) {
    const xml = readTextPart(pkg, layoutPath);
    const placeholders = parseLayoutPlaceholders(xml, theme);

    for (const [idx, placeholder] of placeholders) {
      if (!aggregated.has(idx)) aggregated.set(idx, placeholder);
    }
  }

  // Master cascade: any idx not seen on the layouts inherits from the
  // master placeholder definitions.
  for (const masterPath of findMasterPaths(pkg)) {
    const xml = readTextPart(pkg, masterPath);
    const placeholders = parseLayoutPlaceholders(xml, theme);

    for (const [idx, placeholder] of placeholders) {
      if (!aggregated.has(idx)) aggregated.set(idx, placeholder);
    }
  }

  return aggregated;
}
