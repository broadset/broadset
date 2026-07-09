import type { BroadsetDocument } from '@broadset/model';

/**
 * Static-at-export element types. Everything else either has a
 * native SVG primitive mapping (rectangle / ellipse / path / text /
 * image / svg / qrcode / group) or a documented IN-state static
 * export (video / clock / ticker → a single captured frame per
 * IO-D-16). All 11 element kinds are therefore SVG-representable;
 * the future `canRoundTrip` body lands richer preflight (font
 * availability, ICC constraints, active `<foreignObject>` payloads)
 * on top of this baseline.
 */
const SVG_REPRESENTABLE: ReadonlySet<string> = new Set([
  'text',
  'image',
  'svg',
  'path',
  'rectangle',
  'ellipse',
  'qrcode',
  'group',
  'video',
  'clock',
  'ticker',
]);

export interface CanRoundTripResult {
  readonly canRoundTrip: boolean;
  readonly reasons: readonly string[];
}

/**
 * Preflight check: given a Broadset document, report whether every
 * element has a supported SVG representation. Phase 7.1 covers the
 * element-kind check only — Phase 7.2 layers font availability,
 * embed-permission checks, and conic-gradient fallback warnings on
 * top; Phase 7.3 extends coverage to colour-space gamut issues.
 *
 * A `false` result does NOT block export per IO-D-14; the UI surfaces
 * the reasons as a preflight warning and the user proceeds.
 */
export function canRoundTrip(doc: BroadsetDocument): CanRoundTripResult {
  const reasons: string[] = [];

  for (const el of doc.elements) {
    if (!SVG_REPRESENTABLE.has(el.type)) {
      reasons.push(`Element "${el.id}" has unsupported type "${el.type}" for SVG export`);
    }
  }

  return { canRoundTrip: reasons.length === 0, reasons };
}
