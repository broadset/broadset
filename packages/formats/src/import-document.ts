import { type BroadsetDocument, createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';

import { importPptxWithReport } from './pptx';
import { importPsd } from './psd';
import { importSvg } from './web-vector';

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
  const report = importPptxWithReport(data);
  const structuralWarnings = report.warnings.map(
    (w) => `${w.code}: ${w.message}${w.detail !== undefined ? ` (${w.detail})` : ''}`,
  );
  const fallback = buildFallbackImportWarnings(report.document, 'PPTX');

  return createDocumentImportResult(report.document, [...structuralWarnings, ...fallback]);
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
