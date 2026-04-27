import type { BroadsetDocument, FontAsset } from '@broadset/model';

import type {
  DocumentImportResult,
  DocumentReconciliation,
  DocumentReconciliationElement,
} from './import-document-types';
import { importPdfDocument as runPdfImport } from './pdf';
import { importPptxWithMerge, reconcilePptx } from './pptx';
import { importPsdDocument as runPsdImport } from './psd';
import { importSvgDocument as importSvgDocumentRaw, type SvgImportOptions } from './svg';

export type {
  DocumentImportResult,
  DocumentReconciliation,
  DocumentReconciliationElement,
} from './import-document-types';

function createDocumentImportResult(
  document: BroadsetDocument,
  warnings: readonly string[] = [],
  reconciliation: DocumentReconciliation | null = null,
  fontAssets: readonly FontAsset[] = [],
): DocumentImportResult {
  const base: DocumentImportResult = { document, warnings };

  return {
    ...base,
    ...(reconciliation === null ? {} : { reconciliation }),
    ...(fontAssets.length > 0 ? { fontAssets } : {}),
  };
}

function buildFallbackImportWarnings(document: BroadsetDocument, formatLabel: string): readonly string[] {
  if (document.elements.length > 0) {
    return [];
  }

  return [
    `${formatLabel} import produced no elements. Unsupported content may have been skipped; verify the source file and mapping coverage.`,
  ];
}

/**
 * Build a one-line summary of an external-edit reconciliation against
 * a Broadset-exported PPTX. Surfaces in the import-warnings modal so
 * the user can see what PowerPoint / Keynote / Google Slides / etc.
 * changed since the last export. The summary is intentionally terse —
 * a future "Reconciliation Diff" UI would render the per-element
 * buckets directly, but a one-liner per bucket is the MVP that closes
 * the spec acceptance criteria for "report consumable by the import-
 * warnings modal".
 */
function buildReconciliationSummaries(
  result: Awaited<ReturnType<typeof reconcilePptx>>,
): readonly string[] {
  const summaries: string[] = [];

  if (result.modifications.length > 0) {
    summaries.push(
      `External edits detected: ${String(result.modifications.length)} element${result.modifications.length === 1 ? '' : 's'} modified outside Broadset since last export.`,
    );
  }

  if (result.additions.length > 0) {
    summaries.push(
      `External additions detected: ${String(result.additions.length)} new element${result.additions.length === 1 ? '' : 's'} added outside Broadset since last export.`,
    );
  }

  if (result.deletions.length > 0) {
    summaries.push(
      `External deletions detected: ${String(result.deletions.length)} element${result.deletions.length === 1 ? '' : 's'} removed outside Broadset since last export.`,
    );
  }

  if (result.recoveredByHash.length > 0) {
    summaries.push(
      `Identity recovered by content hash for ${String(result.recoveredByHash.length)} element${result.recoveredByHash.length === 1 ? '' : 's'} (shape tags / extensions stripped externally).`,
    );
  }

  return summaries;
}

/**
 * Import a `.pptx` byte stream into a Broadset document.
 *
 * Async because we route through `importPptxWithMerge`, which uses
 * xxhash-wasm for the per-element interop ledger fingerprint compare.
 * The merge path is what flips `extensions.pptx.dirty=true` on shapes
 * that an external tool (PowerPoint, Keynote, Google Slides, etc.) has
 * edited since the last Broadset export — without it, the dirty
 * detection guarantee in the spec is dead code at the user surface.
 *
 * When the file is a Broadset re-import (carries the
 * `customXml/broadset-project.xml` part), additionally runs the
 * shared `_shared/reconcile/` engine to surface a per-bucket summary
 * of external edits in the import-warnings modal.
 */
export async function importPptxDocument(data: Uint8Array): Promise<DocumentImportResult> {
  const report = await importPptxWithMerge(data);
  const structuralWarnings = report.warnings.map(
    (w) => `${w.code}: ${w.message}${w.detail !== undefined ? ` (${w.detail})` : ''}`,
  );
  const fallback = buildFallbackImportWarnings(report.document, 'PPTX');
  const reconciliation = await reconcilePptx(data);
  const reconciliationSummaries = buildReconciliationSummaries(reconciliation);
  const reconciliationData = buildReconciliationData(reconciliation);

  return createDocumentImportResult(
    report.document,
    [...reconciliationSummaries, ...structuralWarnings, ...fallback],
    reconciliationData,
    report.fontAssets,
  );
}

/**
 * Convert the shared reconcile engine's output into the
 * demo-friendly per-bucket summary the FormatReconciliationModal
 * consumes. Returns null when every bucket is empty so the demo
 * skips the richer modal (the flat warnings modal is enough).
 */
function buildReconciliationData(
  result: Awaited<ReturnType<typeof reconcilePptx>>,
): DocumentReconciliation | null {
  if (
    result.modifications.length === 0 &&
    result.additions.length === 0 &&
    result.deletions.length === 0 &&
    result.recoveredByHash.length === 0
  ) {
    return null;
  }

  const summarise = (el: { readonly id: string; readonly name?: string }, description?: string): DocumentReconciliationElement => ({
    id: el.id,
    ...(el.name !== undefined && el.name.length > 0 ? { name: el.name } : {}),
    ...(description !== undefined ? { description } : {}),
  });

  return {
    modifications: result.modifications.map((mod) => summarise(mod.before, `${String(mod.differences.length)} field${mod.differences.length === 1 ? '' : 's'} changed`)),
    additions: result.additions.map((el) => summarise(el)),
    deletions: result.deletions.map((el) => summarise(el)),
    recoveredByHash: result.recoveredByHash.map((entry) => summarise(entry.currentElement, 'shape tag stripped externally; identity recovered by content hash')),
  };
}

export function importPsdDocument(data: Uint8Array): DocumentImportResult {
  return runPsdImport(data);
}

export async function importPdfDocument(data: Uint8Array): Promise<DocumentImportResult> {
  return await runPdfImport(data);
}

/**
 * Thin adaptor over the SVG module's high-level `importSvgDocument`.
 * Keeps the cross-format `DocumentImportResult` shape the demo
 * consumes while the svg/ package owns all SVG-specific logic.
 */
export function importSvgDocument(
  input: string,
  fileName = 'Imported SVG',
  options?: SvgImportOptions,
): DocumentImportResult {
  const result = importSvgDocumentRaw(input, fileName, options);

  return createDocumentImportResult(result.document, result.warnings);
}
