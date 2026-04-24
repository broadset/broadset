import type { BroadsetDocument } from '@broadset/model';

import { buildPptxPackage, buildPptxPackageSync } from './export/package';
import type { PptxExportOptions } from './types';

/**
 * Export a Broadset document to a PPTX byte stream (asynchronous).
 *
 * Produces a standards-only OOXML package with native shapes, groups,
 * text runs, custom XML parts for round-trip, shape-name tags, and
 * per-shape `<p:extLst>` entries plus the interop ledger
 * (`customXml/broadset-interop.xml`). The ledger requires an xxhash-wasm
 * init on first call which is why this variant is async.
 */
export async function exportPptxBytesAsync(
  document: BroadsetDocument,
  options?: PptxExportOptions,
): Promise<Uint8Array> {
  return buildPptxPackage(document, options);
}

/**
 * Synchronous export. Omits the per-element interop ledger (async-only
 * xxhash-wasm dependency) but retains the document-level fast-path via
 * `customXml/broadset-project.xml`. Callers that need the ledger for
 * round-trip reconciliation should use {@link exportPptxBytesAsync}.
 */
export function exportPptxBytes(document: BroadsetDocument, options?: PptxExportOptions): Uint8Array {
  return buildPptxPackageSync(document, options);
}
