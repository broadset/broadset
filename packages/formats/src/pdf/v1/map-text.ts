import { projectFormatV1 } from '@broadset/model';

import { mapPdfColorV1 } from './map-color';
import type { ParsedPdfPageV1, PdfFontRegistryV1, PdfMappedElementV1, PdfTextItemV1 } from './types';

const APPROXIMATE_CHARACTER_WIDTH = 0.5;
const LINE_HEIGHT_MULTIPLIER = 1.2;
const MINIMUM_BOUND = 1;
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_FONT_WEIGHT = 400;

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function mapPdfTextV1(input: {
  readonly item: PdfTextItemV1;
  readonly page: ParsedPdfPageV1;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id;
  readonly fontRegistry: PdfFontRegistryV1;
}): PdfMappedElementV1 {
  const fontSize = positive(input.item.fontSize, DEFAULT_FONT_SIZE);
  const resolvedFamily = input.page.fontNames.get(input.item.fontName);
  const font = input.fontRegistry.getFont({
    family: resolvedFamily ?? input.item.fontName,
    weight: DEFAULT_FONT_WEIGHT,
  });
  const width = Math.max(MINIMUM_BOUND, input.item.text.length * fontSize * APPROXIMATE_CHARACTER_WIDTH);
  const height = Math.max(MINIMUM_BOUND, fontSize * LINE_HEIGHT_MULTIPLIER);
  const matrix = input.item.transform;
  const geometry = projectFormatV1.createElementGeometry({
    width,
    height,
    transform: {
      kind: 'affine2d',
      matrix: [
        matrix[0],
        -matrix[1],
        -matrix[2],
        matrix[3],
        matrix[2] * fontSize + matrix[4] - input.page.mediaBoxX,
        input.page.height - (matrix[3] * fontSize + matrix[5] - input.page.mediaBoxY),
      ],
    },
  });
  const paragraphId = projectFormatV1.idSchema.parse(`${input.elementId}-paragraph-1`);
  const runId = projectFormatV1.idSchema.parse(`${input.elementId}-run-1`);
  const element = projectFormatV1.createElementV1({
    id: input.elementId,
    name: 'PDF text',
    parentId: input.parentId,
    geometry,
    kind: 'text',
    text: {
      paragraphs: [{
        id: paragraphId,
        properties: projectFormatV1.createParagraphProperties(),
        runs: [{
          id: runId,
          text: input.item.text,
          properties: projectFormatV1.createRunProperties({
            fontFamilyId: font.familyId,
            fontFaceId: font.faceId,
            color: mapPdfColorV1(input.item.color),
            size: fontSize,
            weight: DEFAULT_FONT_WEIGHT,
          }),
        }],
      }],
    },
  });

  const warnings: readonly projectFormatV1.InteropDiagnostic[] = resolvedFamily === undefined ? [{
    code: 'pdf.font-unresolved',
    severity: 'warning',
    message: `PDF font resource ${input.item.fontName} could not be resolved to a BaseFont name.`,
    dimension: 'appearance',
    pointer: '/text',
  }] : [];

  return {
    element,
    warnings,
    mappingConfidence: resolvedFamily === undefined ? 0.7 : 0.9,
    editability: resolvedFamily === undefined ? 'partial' : 'native',
  };
}
