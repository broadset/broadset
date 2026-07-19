import { projectFormatV1 } from '@broadset/model';

import { exportPptxBytesV1 } from './v1/export';
import { importPptxProjectV1 } from './v1/import';

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
interface FixtureAssertionResult {
  readonly elementCount: number;
  readonly warningCount: number;
  readonly reExportedBytes: number;
}

export async function importAndAssert(name: string, bytes: Uint8Array): Promise<FixtureAssertionResult> {
  const importedAt = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');
  const report = await importPptxProjectV1({ bytes, fileName: name, importedAt });
  const elementCount = report.project.documents.reduce((count, document) => count + document.elements.length, 0);
  const warningCount = report.project.interop.records.reduce((count, record) => count + record.warnings.length, 0);
  const surfaced = elementCount > 0 || warningCount > 0;

  if (!surfaced) {
    throw new Error(`${name}: imported zero elements and zero warnings (silent total drop)`);
  }

  const semanticIssues = projectFormatV1.validateBroadsetProjectV1Semantics(report.project);

  if (semanticIssues.length > 0) {
    throw new Error(`${name}: imported project has ${String(semanticIssues.length)} semantic issues`);
  }

  const reExported = await exportPptxBytesV1({ project: report.project, blobs: report.blobs });

  if (reExported.byteLength === 0) {
    throw new Error(`${name}: re-export produced zero bytes`);
  }

  return {
    elementCount,
    warningCount,
    reExportedBytes: reExported.byteLength,
  };
}
