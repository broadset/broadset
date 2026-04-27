import type { BroadsetDocument } from '@broadset/model';

import {
  buildPptxPackage,
  buildPptxPackageSync,
  buildPptxPackageSyncWithReport,
  buildPptxPackageWithReport,
} from './export/package';
import type { PptxExportOptions, PptxExportReport } from './types';

/**
 * Export a Broadset document to a PPTX byte stream (asynchronous).
 *
 * Produces a standards-only OOXML package with native shapes, groups,
 * text runs, custom XML parts for round-trip, shape-name tags, and
 * per-shape `<p:extLst>` entries plus the interop ledger
 * (`customXml/broadset-interop.xml`). The ledger requires an xxhash-wasm
 * init on first call which is why this variant is async.
 *
 * Convenience wrapper that discards fidelity-loss warnings; callers
 * that want the warnings sink should use
 * {@link exportPptxWithReportAsync}.
 */
export async function exportPptxBytesAsync(
  document: BroadsetDocument,
  options?: PptxExportOptions,
): Promise<Uint8Array> {
  return buildPptxPackage(document, options);
}

/**
 * Async export that surfaces fidelity-loss warnings (e.g. silent
 * `box-shadow` drops, animation effects outside the PPTX timing mapper per
 * IO-D-16). Returns both the bytes and the structured warning list so
 * callers can show a fidelity-loss toast to the user.
 */
export async function exportPptxWithReportAsync(
  document: BroadsetDocument,
  options?: PptxExportOptions,
): Promise<PptxExportReport> {
  return buildPptxPackageWithReport(document, options);
}

/**
 * Synchronous export. Omits the per-element interop ledger (async-only
 * xxhash-wasm dependency) but retains the document-level fast-path via
 * `customXml/broadset-project.xml`. Callers that need the ledger for
 * round-trip reconciliation should use {@link exportPptxBytesAsync};
 * callers that want the warnings sink should use
 * {@link exportPptxWithReport}.
 */
export function exportPptxBytes(document: BroadsetDocument, options?: PptxExportOptions): Uint8Array {
  return buildPptxPackageSync(document, options);
}

/**
 * Synchronous export that surfaces fidelity-loss warnings. Mirrors
 * {@link exportPptxWithReportAsync} but for the no-ledger sync path.
 */
export function exportPptxWithReport(
  document: BroadsetDocument,
  options?: PptxExportOptions,
): PptxExportReport {
  return buildPptxPackageSyncWithReport(document, options);
}
