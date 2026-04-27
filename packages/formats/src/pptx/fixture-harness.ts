import { exportPptxBytes } from './export';
import { importPptxWithReport, type PptxImportReport } from './import';

/**
 * @description Shared assertion contract for real-world `.pptx` fixtures.
 *
 * Both the user-dropped local fixtures (`real-fixtures.test.ts`) and
 * the manifest-fetched permissive corpus (`corpus.test.ts`) gate
 * against the same low-bar acceptance:
 *
 * - Import must not throw.
 * - At least one element OR one warning is produced (silent zero-zero
 *   means we dropped everything without surfacing it — that's the
 *   regression this gate is here to catch).
 * - Every imported element initialises `extensions.pptx.dirty=false` —
 *   untouched imports never carry an "edit" provenance until reconcile
 *   marks them otherwise.
 * - Re-export produces a non-zero byte stream.
 *
 * Tighter assertions are intentionally absent. Real fixtures vary
 * widely; over-asserting on per-element shape catches false negatives
 * far more often than real bugs. The harness is primarily a "does the
 * importer survive arbitrary input" gate.
 */
export interface FixtureAssertionResult {
  readonly elementCount: number;
  readonly warningCount: number;
  readonly reExportedBytes: number;
}

export function importAndAssert(name: string, bytes: Uint8Array): FixtureAssertionResult {
  const report: PptxImportReport = importPptxWithReport(bytes);
  const surfaced = report.document.elements.length > 0 || report.warnings.length > 0;

  if (!surfaced) {
    throw new Error(`${name}: imported zero elements and zero warnings (silent total drop)`);
  }

  for (const el of report.document.elements) {
    const ext = el.extensions['pptx'] as { readonly dirty?: boolean } | undefined;

    if (ext?.dirty !== false) {
      throw new Error(`${name}: element ${el.id} has extensions.pptx.dirty=${String(ext?.dirty)} (expected false)`);
    }
  }

  const reExported = exportPptxBytes(report.document);

  if (reExported.byteLength === 0) {
    throw new Error(`${name}: re-export produced zero bytes`);
  }

  return {
    elementCount: report.document.elements.length,
    warningCount: report.warnings.length,
    reExportedBytes: reExported.byteLength,
  };
}
