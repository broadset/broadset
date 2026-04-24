import type { BroadsetDocument } from '@broadset/model';

import { importPptx } from './pptx';
import { importPsd } from './psd';
import { importSvgDocument as importSvgDocumentRaw, type SvgImportOptions } from './svg';

export interface DocumentImportResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
}

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
  const document = importPsd(data);

  return createDocumentImportResult(document, buildFallbackImportWarnings(document, 'PSD'));
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
