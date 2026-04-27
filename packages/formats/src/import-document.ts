import { type BroadsetDocument, createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';

import { importPptxWithMerge, reconcilePptx } from './pptx';
import { importPsd } from './psd';
import { importSvg } from './web-vector';

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
}

function createDocumentImportResult(
  document: BroadsetDocument,
  warnings: readonly string[] = [],
  reconciliation: DocumentReconciliation | null = null,
): DocumentImportResult {
  return reconciliation === null ? { document, warnings } : { document, warnings, reconciliation };
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
  const document = importPsd(data);

  return createDocumentImportResult(document, buildFallbackImportWarnings(document, 'PSD'));
}

export function importSvgDocument(input: string, fileName = 'Imported SVG'): DocumentImportResult {
  const result = importSvg(input);
  const document = createEmptyBroadsetDocument();

  return createDocumentImportResult(
    {
      ...document,
      name: fileName.replace(/\.svg$/i, ''),
      canvas: { ...document.canvas, width: result.canvasWidth, height: result.canvasHeight },
      elements: result.elements.map((element, index) =>
        createDefaultElement(element.type === 'path' ? 'path' : 'svg', {
          id: `imported-${String(index)}`,
          name: `Element ${String(index + 1)}`,
          position: { x: element.position.x, y: element.position.y },
          width: element.width,
          height: element.height,
          rotation: element.rotation,
          content: element.content,
          style: element.style,
        }),
      ),
    },
    result.warnings,
  );
}
