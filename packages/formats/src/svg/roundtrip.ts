import type { BroadsetDocument, BroadsetElement } from '@broadset/model';

import { fingerprintElement } from '../_shared/fingerprint';
import { reconcile, type ReconcileResult } from '../_shared/reconcile';
import { importSvgDocument } from './import';

export interface ReconcileSvgInput {
  /** The last-known preserved document (from `.bsp` or prior export). */
  readonly preserved: BroadsetDocument;
  /** The current visual SVG string (e.g. a file from Illustrator / Inkscape). */
  readonly currentSvg: string;
}

/**
 * P7.5 — SVG round-trip reconciliation entry point. Given the
 * preserved Broadset document and the current visual SVG, produce a
 * canonical `ReconcileResult` listing modifications, additions,
 * deletions, and hash-recovered matches per
 * `project/spec/formats/svg.md` → "Reconciliation Reporting".
 *
 * Identity recovery tiers:
 * 1. `data-bs-id` match — same id on both sides → modification
 *    (or clean round-trip when fields match).
 * 2. New id in current visual, no fingerprint match → addition.
 * 3. Id in preserved, missing from visual, no fingerprint match →
 *    deletion (user confirms in the demo UI before drop).
 * 4. Stripped-tag fallback: fingerprint match across add/delete
 *    pair → recovered by hash (tag was lost but visual identity
 *    survived).
 */
export async function reconcileSvg(input: ReconcileSvgInput): Promise<ReconcileResult> {
  const { document: currentDoc } = importSvgDocument(input.currentSvg);
  const fingerprintsByElementId = await buildFingerprintMap(input.preserved, currentDoc);
  // Normalise `extensions.svg` on both sides so the dirty-flag
  // bookkeeping (which the importer stamps on every hydrated
  // element) doesn't surface as a microdiff modification when the
  // preserved doc never went through the importer.
  const preservedNormalised = input.preserved.elements.map(normaliseForReconcile);
  const currentNormalised = currentDoc.elements.map(normaliseForReconcile);

  return reconcile({
    preservedMetadata: { elements: preservedNormalised },
    currentVisual: { elements: currentNormalised },
    fingerprintsByElementId,
  });
}

/**
 * Strip the `extensions.svg.dirty` bookkeeping flag from an element
 * before reconciling. The flag is import-side state — present
 * after `importSvgDocument` hydrates an element, absent on elements
 * authored directly in Broadset — so diffing it produces false
 * modifications that obscure the semantic changes the user made in
 * an external editor.
 */
function normaliseForReconcile(el: BroadsetElement): BroadsetElement {
  const { svg: _svg, ...restExtensions } = el.extensions as { svg?: unknown } & Record<string, unknown>;

  return { ...el, extensions: restExtensions };
}

async function buildFingerprintMap(
  preserved: BroadsetDocument,
  current: BroadsetDocument,
): Promise<ReadonlyMap<string, string>> {
  const map = new Map<string, string>();

  for (const el of preserved.elements) {
    map.set(el.id, await fingerprintElement(el));
  }

  for (const el of current.elements) {
    if (!map.has(el.id)) {
      map.set(el.id, await fingerprintElement(el));
    }
  }

  return map;
}

/**
 * Return the ids of every element whose `extensions.svg.dirty` flag
 * is `true`. The demo uses this to decide which elements re-export
 * from current Broadset state versus re-emit the preserved blob
 * byte-for-byte per the spec's dirty-flag discipline (IO-D-11).
 *
 * Elements without `extensions.svg` or with `dirty === false` are
 * excluded from the list (i.e. treated as clean).
 */
export function dirtyElementIds(doc: BroadsetDocument): readonly string[] {
  const dirty: string[] = [];

  for (const el of doc.elements) {
    if (isDirty(el)) {
      dirty.push(el.id);
    }
  }

  return dirty;
}

function isDirty(el: BroadsetElement): boolean {
  const raw = el.extensions['svg'];

  if (typeof raw !== 'object' || raw === null) {
    return false;
  }

  const withDirty = raw as { readonly dirty?: unknown };

  return withDirty.dirty === true;
}
