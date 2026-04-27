import type { BroadsetDocument } from '@broadset/model';

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
}
