import type { BroadsetDocument } from '@broadset/model';

import type { DocumentImportResult } from './import-document-types';
import { importPdfDocument as runPdfImport } from './pdf';
import { importPptx } from './pptx';
import { importPsdDocument as runPsdImport } from './psd';
import { importSvgDocument as importSvgDocumentRaw, type SvgImportOptions } from './svg';

export type { DocumentImportResult } from './import-document-types';

function createDocumentImportResult(
  document: BroadsetDocument,
  warnings: readonly string[] = [],
): DocumentImportResult {
  return { document, warnings };
}

function buildFallbackImportWarnings(document: BroadsetDocument, formatLabel: string): readonly string[] {
  if (document.elements.length > 0) {
    return [];
  }

  return [
    `${formatLabel} import produced no elements. Unsupported content may have been skipped; verify the source file and mapping coverage.`,
  ];
}

export function importPptxDocument(data: Uint8Array): DocumentImportResult {
  const document = importPptx(data);

  return createDocumentImportResult(document, buildFallbackImportWarnings(document, 'PPTX'));
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
