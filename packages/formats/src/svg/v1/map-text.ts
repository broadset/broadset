import { projectFormatV1 } from '@broadset/model';

import { mapCssColorV1 } from './paint-color';
import type { FontRegistryV1, SvgImportedStyle, SvgImportedTextBody } from './types';

const DEFAULT_FONT_FAMILY = 'sans-serif';
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = 400;

function finitePositive(value: unknown, fallback: number): number {
  let parsed = Number.NaN;

  if (typeof value === 'number') parsed = value;
  if (typeof value === 'string') parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function fontWeight(value: unknown, fallback: number): number {
  if (value === 'bold') return 700;
  if (value === 'normal') return 400;

  return Math.min(1000, Math.max(1, Math.round(finitePositive(value, fallback))));
}

function recordValue(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function sourceAttribute(element: Element | undefined, name: string): string | null {
  let current = element;

  while (current !== undefined) {
    const value = current.getAttribute(name);

    if (value !== null && value !== '') return value;

    current = current.parentElement ?? undefined;
  }

  return null;
}

function alignment(value: string | undefined): projectFormatV1.ParagraphProperties['alignment'] {
  if (value === 'center' || value === 'middle') return 'center';
  if (value === 'right' || value === 'end') return 'end';
  if (value === 'justify') return 'justify';

  return 'start';
}

function fontStyle(value: unknown): 'normal' | 'italic' | 'oblique' {
  return value === 'italic' || value === 'oblique' ? value : 'normal';
}

function mapRun(input: {
  readonly text: string;
  readonly style: unknown;
  readonly baseStyle: SvgImportedStyle;
  readonly source: Element | undefined;
  readonly id: projectFormatV1.Id;
  readonly fontRegistry: FontRegistryV1;
}): projectFormatV1.TextRun {
  const familyValue = recordValue(input.style, 'fontFamily');
  const sizeValue = recordValue(input.style, 'fontSize');
  const weightValue = recordValue(input.style, 'fontWeight');
  const styleValue = recordValue(input.style, 'fontStyle');
  const colorValue = recordValue(input.style, 'fontColor');
  const family =
    typeof familyValue === 'string' ? familyValue : sourceAttribute(input.source, 'font-family') ?? input.baseStyle.fontFamily ?? DEFAULT_FONT_FAMILY;
  const size = finitePositive(sizeValue, finitePositive(sourceAttribute(input.source, 'font-size') ?? input.baseStyle.fontSize, DEFAULT_FONT_SIZE));
  const weight = fontWeight(weightValue, fontWeight(sourceAttribute(input.source, 'font-weight') ?? input.baseStyle.fontWeight, DEFAULT_FONT_WEIGHT));
  const style = fontStyle(styleValue ?? sourceAttribute(input.source, 'font-style') ?? input.baseStyle.fontStyle);
  const font = input.fontRegistry.getFont({ family, weight, style });
  const properties = projectFormatV1.createRunProperties({
    fontFamilyId: font.familyId,
    fontFaceId: font.faceId,
    size,
    weight,
    color: mapCssColorV1(typeof colorValue === 'string' ? colorValue : sourceAttribute(input.source, 'fill') ?? '#000000'),
  });

  return { id: input.id, text: input.text, properties };
}

export function mapTextBodyV1(input: {
  readonly content: string | SvgImportedTextBody;
  readonly style: SvgImportedStyle;
  readonly source: Element | undefined;
  readonly elementId: projectFormatV1.Id;
  readonly fontRegistry: FontRegistryV1;
}): projectFormatV1.TextBody {
  const importedParagraphs: readonly SvgImportedTextBody['paragraphs'][number][] = typeof input.content === 'string'
    ? input.content.split('\n').map((text) => ({ runs: [{ text }] }))
    : input.content.paragraphs;

  return {
    paragraphs: importedParagraphs.map((paragraph, paragraphIndex) => {
      const properties = projectFormatV1.createParagraphProperties();
      const paragraphAlignment = alignment(
        sourceAttribute(input.source, 'text-anchor') ?? sourceAttribute(input.source, 'text-align') ?? input.style.textAlignment,
      );

      return {
        id: projectFormatV1.idSchema.parse(`${input.elementId}-paragraph-${String(paragraphIndex + 1)}`),
        properties: { ...properties, alignment: paragraphAlignment },
        runs: paragraph.runs.map((run, runIndex) =>
          mapRun({
            text: run.text,
            style: 'props' in run ? run.props?.style : undefined,
            baseStyle: input.style,
            source: input.source,
            id: projectFormatV1.idSchema.parse(
              `${input.elementId}-paragraph-${String(paragraphIndex + 1)}-run-${String(runIndex + 1)}`,
            ),
            fontRegistry: input.fontRegistry,
          }),
        ),
      };
    }),
  };
}
