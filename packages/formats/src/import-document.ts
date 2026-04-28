import type { BroadsetDocument, FontAsset } from '@broadset/model';

import { fingerprintElement } from './_shared/fingerprint';
import type { ReconcileResult } from './_shared/reconcile';
import type {
  DocumentImportResult,
  DocumentReconciliation,
  DocumentReconciliationElement,
} from './import-document-types';
import { importPdfDocument as runPdfImport, readPreservedPdfDocument, reconcilePdf } from './pdf';
import { importPptxWithMerge, reconcilePptx } from './pptx';
import { importPsdDocument as runPsdImport, readPreservedPsdDocument, reconcilePsd } from './psd';
import { importSvgDocument as importSvgDocumentRaw, reconcileSvg, SVG_BROADSET_NAMESPACE, type SvgImportOptions } from './svg';

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
 * a Broadset-exported file. Surfaces in the import-warnings modal so
 * the user can see what an external editor (PowerPoint, Illustrator,
 * Photoshop, Acrobat, etc.) changed since the last export. The summary
 * is intentionally terse — a future "Reconciliation Diff" UI would
 * render the per-element buckets directly, but a one-liner per bucket
 * is the MVP that closes the spec acceptance criteria for "report
 * consumable by the import-warnings modal".
 */
function buildReconciliationSummaries(result: ReconcileResult): readonly string[] {
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
 * Convert the shared reconcile engine's output into the
 * demo-friendly per-bucket summary the FormatReconciliationModal
 * consumes. Returns null when every bucket is empty so the demo
 * skips the richer modal (the flat warnings modal is enough).
 */
function buildReconciliationData(result: ReconcileResult): DocumentReconciliation | null {
  if (
    result.modifications.length === 0 &&
    result.additions.length === 0 &&
    result.deletions.length === 0 &&
    result.recoveredByHash.length === 0
  ) {
    return null;
  }

  const summarise = (
    el: { readonly id: string; readonly name?: string },
    description?: string,
  ): DocumentReconciliationElement => ({
    id: el.id,
    ...(el.name !== undefined && el.name.length > 0 ? { name: el.name } : {}),
    ...(description !== undefined ? { description } : {}),
  });

  return {
    modifications: result.modifications.map((mod) =>
      summarise(mod.before, `${String(mod.differences.length)} field${mod.differences.length === 1 ? '' : 's'} changed`),
    ),
    additions: result.additions.map((el) => summarise(el)),
    deletions: result.deletions.map((el) => summarise(el)),
    recoveredByHash: result.recoveredByHash.map((entry) =>
      summarise(entry.currentElement, 'shape tag stripped externally; identity recovered by content hash'),
    ),
  };
}

/**
 * Build a fingerprint map covering every element in the supplied
 * preserved + current populations, keyed by element id. Mirrors the
 * helper PPTX reconciliation uses internally — kept here so PDF / PSD
 * can call the shared `_shared/reconcile/` engine without each
 * importer rolling its own fingerprint walk.
 */
async function buildFingerprintMap(
  preserved: BroadsetDocument,
  current: BroadsetDocument,
): Promise<ReadonlyMap<string, string>> {
  const map = new Map<string, string>();

  for (const el of preserved.elements) {
    if (!map.has(el.id)) {
      map.set(el.id, await fingerprintElement(el));
    }
  }

  for (const el of current.elements) {
    if (!map.has(el.id)) {
      map.set(el.id, await fingerprintElement(el));
    }
  }

  return map;
}

/**
 * Run reconciliation across a preserved + current document pair using
 * the supplied per-format reconcile entry point, then fold the result
 * into the cross-format `DocumentImportResult` shape (warnings +
 * reconciliation buckets). Used by both PDF and PSD; SVG has its own
 * dedicated entry (`reconcileSvg`) because it re-parses the source
 * string internally.
 */
async function reconcileAgainstPreserved(
  preserved: BroadsetDocument,
  current: BroadsetDocument,
  runner: (input: {
    readonly preserved: BroadsetDocument;
    readonly current: BroadsetDocument;
    readonly fingerprintsByElementId: ReadonlyMap<string, string>;
  }) => ReconcileResult,
): Promise<{ readonly summaries: readonly string[]; readonly data: DocumentReconciliation | null }> {
  const fingerprintsByElementId = await buildFingerprintMap(preserved, current);
  const result = runner({ preserved, current, fingerprintsByElementId });

  return {
    summaries: buildReconciliationSummaries(result),
    data: buildReconciliationData(result),
  };
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
 * Import a `.psd` byte stream into a Broadset document. Async because
 * reconciliation runs the shared `_shared/reconcile/` engine, which
 * awaits xxhash-wasm via `fingerprintElement`. When the PSD carries a
 * Broadset XMP packet (re-import of a previously-exported PSD), runs
 * the diff against the preserved snapshot and populates
 * `DocumentImportResult.reconciliation` so the demo can light up its
 * `FormatReconciliationModal`. Arbitrary third-party PSDs leave the
 * field null.
 */
export async function importPsdDocument(data: Uint8Array): Promise<DocumentImportResult> {
  const result = runPsdImport(data);
  const preserved = readPreservedPsdDocument(data);

  if (preserved === null) {
    return createDocumentImportResult(result.document, result.warnings);
  }

  const reconciled = await reconcileAgainstPreserved(preserved, result.document, reconcilePsd);

  return createDocumentImportResult(result.document, [...reconciled.summaries, ...result.warnings], reconciled.data);
}

/**
 * Import a `.pdf` byte stream into a Broadset document. When the PDF
 * carries a `broadset:` XMP packet (re-import of a previously-exported
 * PDF), runs the shared `_shared/reconcile/` engine against the
 * preserved snapshot and populates `DocumentImportResult.reconciliation`
 * so the demo can light up its `FormatReconciliationModal`. Arbitrary
 * third-party PDFs leave the field null.
 */
export async function importPdfDocument(data: Uint8Array): Promise<DocumentImportResult> {
  const result = await runPdfImport(data);
  const preserved = await readPreservedPdfDocument(data);

  if (preserved === null) {
    return createDocumentImportResult(result.document, result.warnings);
  }

  const reconciled = await reconcileAgainstPreserved(preserved, result.document, reconcilePdf);

  return createDocumentImportResult(result.document, [...reconciled.summaries, ...result.warnings], reconciled.data);
}

/**
 * Thin adaptor over the SVG module's high-level `importSvgDocument`.
 * Keeps the cross-format `DocumentImportResult` shape the demo
 * consumes while the svg/ package owns all SVG-specific logic. Async
 * because reconciliation runs the shared `_shared/reconcile/` engine,
 * which awaits xxhash-wasm via `fingerprintElement` (called inside
 * `reconcileSvg`).
 */
export async function importSvgDocument(
  input: string,
  fileName = 'Imported SVG',
  options?: SvgImportOptions,
): Promise<DocumentImportResult> {
  const result = importSvgDocumentRaw(input, fileName, options);

  if (!hasBroadsetSvgMetadata(input)) {
    return createDocumentImportResult(result.document, result.warnings);
  }

  const reconciliation = await reconcileSvg({ preserved: result.document, currentSvg: input });
  const summaries = buildReconciliationSummaries(reconciliation);
  const data = buildReconciliationData(reconciliation);

  return createDocumentImportResult(result.document, [...summaries, ...result.warnings], data);
}

/**
 * Detect whether an SVG byte stream carries the Broadset round-trip
 * metadata namespace. Used to gate reconciliation: arbitrary
 * third-party SVGs leave `reconciliation` null, while Broadset
 * round-trips trigger the diff so the modal lights up. A simple
 * substring check is sufficient — the namespace string is unique and
 * the SVG importer already validates the packet structurally.
 */
function hasBroadsetSvgMetadata(input: string): boolean {
  return input.includes(SVG_BROADSET_NAMESPACE);
}
