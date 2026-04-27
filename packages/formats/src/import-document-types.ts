import type { BroadsetDocument, FontAsset } from '@broadset/model';

/**
 * Per-bucket summary surfaced to the demo's reconciliation modal so
 * users see element names, not just counts. Mirrors the shape that
 * `_shared/reconcile/` produces but only carries the user-visible
 * fields (id + name + a one-line description for modifications).
 */
export interface DocumentReconciliationElement {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
}

export interface DocumentReconciliation {
  readonly modifications: readonly DocumentReconciliationElement[];
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
