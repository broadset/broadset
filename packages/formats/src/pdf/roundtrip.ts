import type { BroadsetDocument, BroadsetElement } from '@broadset/model';

import { reconcile,type ReconcileResult } from '../_shared/reconcile';

/**
 * Phase 6 P6.5 — PDF reconciliation. Thin wrapper over
 * `_shared/reconcile` that diffs the preserved Broadset metadata (the
 * `BroadsetDocument` hydrated from the XMP + marked-content fast path
 * in P6.4a) against the current operator-level visual document (what
 * the PDF reader re-imported via the P6.4b extraction pass).
 *
 * Output buckets (from `_shared/reconcile/ReconcileResult`):
 *
 * - `modifications` — id-matched pairs whose non-identity fields
 *   differ. Carries `before` / `after` references and a `microdiff`
 *   payload so the import-warning UI can render per-field conflict
 *   markers.
 * - `additions` — elements in `currentVisual` whose ids and fingerprints
 *   do not match any preserved entry. Land on the "Imported from PDF"
 *   staging page per `project/spec/formats/pdf.md` → "Reconciliation
 *   Reporting".
 * - `deletions` — ids in `preservedMetadata` that neither a marked-
 *   content tag nor a fingerprint match could recover. The user
 *   confirms deletion before the element drops.
 * - `recoveredByHash` — deletion / addition pairs whose `/BSET`
 *   marked-content tag was stripped by an aggressive external edit but
 *   whose `fingerprintElement()` hash still matched, preventing a
 *   spurious delete + add event.
 */
export interface PdfReconcileInput {
  readonly preserved: BroadsetDocument;
  readonly current: BroadsetDocument;
  /**
   * Stable fingerprints keyed by element id across both populations.
   * Callers compute these via `_shared/fingerprint/fingerprintElement`
   * (async) before invoking reconciliation; the map is cached once and
   * shared between the two diff sides for a single reconciliation pass.
   */
  readonly fingerprintsByElementId: ReadonlyMap<string, string>;
}

export function reconcilePdf(input: PdfReconcileInput): ReconcileResult {
  return reconcile({
    preservedMetadata: { elements: [...input.preserved.elements] },
    currentVisual: { elements: [...input.current.elements] },
    fingerprintsByElementId: input.fingerprintsByElementId,
  });
}

/**
 * Returns the element ids whose `extensions.pdf.dirty === true`, i.e.
 * elements the user or an external tool edited after import. The
 * exporter re-synthesises these from current Broadset state and emits
 * the preserved original operator blob for the remainder (dirty-flag
 * discipline — see `project/spec/formats/pdf.md` → "Dirty-Flag
 * Discipline").
 */
export function dirtyElementIds(doc: BroadsetDocument): readonly string[] {
  const out: string[] = [];

  for (const el of doc.elements) {
    if (isDirty(el)) out.push(el.id);
  }

  return out;
}

function isDirty(element: BroadsetElement): boolean {
  const extensions = element.extensions as Readonly<Record<string, unknown>> | undefined;

  if (extensions === undefined) return false;

  const pdf = extensions['pdf'];

  if (pdf === undefined || pdf === null || typeof pdf !== 'object') return false;

  return (pdf as Record<string, unknown>)['dirty'] === true;
}
