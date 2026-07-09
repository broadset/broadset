import type { BroadsetDocument } from '@broadset/model';

import type { DocumentReconciliationModification } from './import-document-types';

/**
 * Per-modification choice the user makes in `FormatReconciliationModal`.
 *
 * `'visual'` is the silent default that has shipped since Phase 8 — keep
 * the externally-edited element exactly as the re-imported document
 * carries it. `'preserved'` reverts the element to its last
 * Broadset-export snapshot, discarding the external edit for that
 * element only.
 */
export type ReconciliationChoice = 'preserved' | 'visual';

/**
 * Apply per-modification "Use preserved / Use visual" choices to a
 * re-imported document. For each element id present in `modifications`,
 * looks up the user's choice in `choices` (defaulting to `'visual'` when
 * unset) and either keeps the current element or swaps in the preserved
 * one. Elements outside the modifications bucket are left untouched.
 *
 * Pure function — returns a new document with a new `elements` array;
 * never mutates the input. Phase 4.9 of
 * cross-format-io-improvement-plan.md (closes pptx-known-gaps §A1).
 */
export function applyReconciliationChoices(
  doc: BroadsetDocument,
  modifications: readonly DocumentReconciliationModification[],
  choices: ReadonlyMap<string, ReconciliationChoice>,
): BroadsetDocument {
  if (modifications.length === 0) return doc;

  const modById = new Map(modifications.map((mod) => [mod.id, mod]));

  return {
    ...doc,
    elements: doc.elements.map((el) => {
      const mod = modById.get(el.id);

      if (mod === undefined) return el;

      const choice = choices.get(el.id) ?? 'visual';

      return choice === 'preserved' ? mod.preservedElement : el;
    }),
  };
}
