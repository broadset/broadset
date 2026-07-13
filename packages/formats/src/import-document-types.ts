import type { BroadsetDocument, BroadsetElement, FontAsset } from '@broadset/model';

/**
 * Per-bucket summary surfaced to the demo's reconciliation modal so
 * users see element names, not just counts. Mirrors the shape that
 * `_shared/reconcile/` produces but only carries the user-visible
 * fields (id + name + a one-line description for modifications).
 */
interface DocumentReconciliationElement {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
}

/**
 * Richer per-modification entry for the conflict-resolution UX (Phase
 * CFIO.4.9 (plan-progress.md §CFIO), closes pptx-known-gaps
 * §A1). Carries both the preserved (last Broadset export) element and
 * the current (re-imported, externally edited) element so the demo can
 * resolve "Use preserved" by swapping the element back in `loadTemplate`.
 *
 * The `FormatReconciliationModal` itself stays decoupled from
 * `BroadsetElement` — the demo translates this richer shape into the
 * UI's plain summaries (id + name + description) and keeps the element
 * references for choice resolution after the user acknowledges.
 */
interface DocumentReconciliationModification extends DocumentReconciliationElement {
  /** The element as it was in the preserved (last Broadset-export) document. */
  readonly preservedElement: BroadsetElement;
  /** The element as it is in the visual (re-imported) document. */
  readonly currentElement: BroadsetElement;
}

interface DocumentReconciliation {
  readonly modifications: readonly DocumentReconciliationModification[];
  readonly additions: readonly DocumentReconciliationElement[];
  readonly deletions: readonly DocumentReconciliationElement[];
  readonly recoveredByHash: readonly DocumentReconciliationElement[];
}

/**
 * Uniform return shape for every format-specific document importer.
 * `warnings` carries non-fatal messages (mapping coverage, stripped
 * JavaScript, malformed-input recovery) so the demo + programmatic
 * callers can surface them in a consistent way.
 *
 * Lifted into its own file so format-specific modules can reference
 * the type without importing the top-level `import-document.ts`
 * (which itself imports from each format module — that would form
 * a cycle).
 */
export interface DocumentImportResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
  /**
   * Populated for PPTX re-imports of Broadset-exported files. `null`
   * for arbitrary third-party files (no preserved metadata) and for
   * non-PPTX formats. Contains the four reconcile buckets so the
   * demo can render `FormatReconciliationModal` for a richer diff
   * UX than the flat-string warnings list.
   */
  readonly reconciliation?: DocumentReconciliation | null;
  /**
   * Embedded fonts recovered from `ppt/fonts/` (PPTX) or any future
   * format's font-embedding pipeline. Empty for arbitrary third-party
   * files without embedded fonts and for formats that don't carry
   * fonts. Hosts (the demo, the editor) can splice these into the
   * project's `assets` so subsequent edits / re-exports keep the
   * fonts available without forcing the user to re-upload.
   */
  readonly fontAssets?: readonly FontAsset[];
}
