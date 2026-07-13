import { type BroadsetDocument, type BroadsetElement } from '@broadset/model';

import { reconcile, type ReconcileResult } from '../_shared/reconcile';

/**
 * Phase 5 P5.5 — PSD reconciliation. Wraps `_shared/reconcile` to
 * produce a four-bucket diff between the preserved Broadset metadata
 * (hydrated from the XMP packet on re-import, see P5.4a) and the
 * current visual layer tree (what Photoshop wrote to the PSD).
 *
 * Dirty-flag discipline: `extensions.psd.dirty === false` elements
 * that round-trip byte-identical stay out of `modifications`. When
 * Photoshop edits an element the flag flips to `true` on re-import
 * via the editor middleware; those edits land as modifications.
 */

interface PsdReconcileInput {
  readonly preserved: BroadsetDocument;
  readonly current: BroadsetDocument;
  /**
   * Fingerprint map keyed by element id across both populations. The
   * caller computes these via `_shared/fingerprint/fingerprintElement`
   * (async) or a sync fallback — `reconcile` doesn't care which, it
   * only needs stable comparable strings.
   */
  readonly fingerprintsByElementId: ReadonlyMap<string, string>;
}

export function reconcilePsd(input: PsdReconcileInput): ReconcileResult {
  return reconcile({
    preservedMetadata: { elements: input.preserved.elements.map(normaliseForReconcile) },
    currentVisual: { elements: input.current.elements.map(normaliseForReconcile) },
    fingerprintsByElementId: input.fingerprintsByElementId,
  });
}

/**
 * Strip the `extensions.psd` bookkeeping (`dirty`, `roundTrip`)
 * before reconciling. The flags are import-side state — present after
 * `importPsdDocument` hydrates an element, absent on elements parsed
 * from the preserved XMP payload — so diffing them surfaces false
 * `modifications` that obscure the actual external edits the user
 * made in Photoshop. Mirrors the SVG `normaliseForReconcile`
 * strategy in `svg/roundtrip.ts`.
 */
function normaliseForReconcile(el: BroadsetElement): BroadsetElement {
  // The model declares `extensions` as non-nullable, but several
  // older test fixtures cast through `as BroadsetElement` and omit
  // the field — so we treat the value as possibly-undefined at the
  // boundary to keep the destructure safe.
  const source = el.extensions as ({ psd?: unknown } & Record<string, unknown>) | undefined;
  const { psd: _psd, ...restExtensions } = source ?? {};

  return { ...el, extensions: restExtensions };
}

/**
 * Returns the element ids whose `extensions.psd.dirty === true`, i.e.
 * edits the user or an external tool made after import. The exporter
 * re-synthesises these from current Broadset state and emits the
 * preserved original blob for the remainder.
 */
export function dirtyElementIds(doc: BroadsetDocument): readonly string[] {
  const out: string[] = [];

  for (const el of doc.elements) {
    if (isDirty(el)) out.push(el.id);
  }

  return out;
}

function isDirty(element: BroadsetElement): boolean {
  const psd = (element.extensions as { readonly psd?: { readonly dirty?: unknown } } | undefined)?.psd;

  if (psd === undefined) return false;

  return psd.dirty === true;
}
