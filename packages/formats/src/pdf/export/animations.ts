import type { BroadsetElement } from '@broadset/model';

/**
 * Phase 6 P6.3 — animation IN-state resolution.
 *
 * Per `IO-D-16` and `project/spec/formats/pdf.md` §"Animated Element
 * Static Export", PDF is a static carrier — animations are NOT
 * serialized to XMP or marked content. The exporter renders animated
 * elements at their fully-entered "IN" state (every entry keyframe
 * resolved to its end position, before any exit keyframe runs).
 *
 * The resolver is currently identity (it returns the element
 * untouched) because the document model already stores element style
 * + geometry as the resting / IN-state values; the active animation
 * is a layered effect on top, and the exporter's IO-D-16 contract is
 * to render the resting state. When animation modifiers move from
 * being "applied at runtime" to "baked into a per-frame snapshot",
 * this resolver becomes the seam where the IN-state snapshot is
 * computed. The signature is stable so callers don't need updating.
 */
export function resolveAnimatedElementInState(element: BroadsetElement): BroadsetElement {
  return element;
}
