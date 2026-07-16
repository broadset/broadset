import {
  projectFormatV1,
} from '@broadset/model';

import {
  isPptxSourceTextBody,
  pptxSourceColorSchema,
  type PptxSourceElement,
  type PptxSourceStyle,
} from '../project-model';
import { mapPptxAppearanceV1 } from './appearance';
import type { PptxFontRegistryV1 } from './font-registry';

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = 400;
const BOLD_FONT_WEIGHT = 700;
const MAX_CHANNEL = 255;

function elementName(source: PptxSourceElement): string {
  return source.name.trim() === '' ? 'PPTX text' : source.name;
}

function stringValue(values: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = values?.[key];

  return typeof value === 'string' ? value : undefined;
}

function numberValue(values: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
  const value = values?.[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(values: Readonly<Record<string, unknown>> | undefined, key: string): boolean | undefined {
  const value = values?.[key];

  return typeof value === 'boolean' ? value : undefined;
}

function semanticRole(input: {
  readonly italic: boolean;
  readonly weight: number;
}): projectFormatV1.RunProperties['semanticRole'] {
  if (input.italic) return 'emphasis';
  if (input.weight >= BOLD_FONT_WEIGHT) return 'strong';

  return 'none';
}

function textList(bulletKind: 'none' | 'char' | 'auto' | undefined): projectFormatV1.TextList {
  if (bulletKind === 'char') return { kind: 'unordered', level: 0, marker: 'disc' };
  if (bulletKind === 'auto') return { kind: 'ordered', level: 0, startAt: 1, style: 'decimal' };

  return { kind: 'none' };
}

function textColor(input: {
  readonly style: PptxSourceStyle;
  readonly runStyle: Readonly<Record<string, unknown>> | undefined;
}): projectFormatV1.ColorValue {
  const parsed = pptxSourceColorSchema.safeParse(input.runStyle?.['color']);
  const color = parsed.success ? parsed.data : input.style.fontColor;

  if (color?.kind !== 'rgb') return projectFormatV1.createBlackColorValue();

  const hex = color.hex.slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / MAX_CHANNEL : 1;

  if (![red, green, blue, alpha].every(Number.isFinite)) return projectFormatV1.createBlackColorValue();

  return {
    kind: 'color',
    space: 'srgb',
    channels: [red / MAX_CHANNEL, green / MAX_CHANNEL, blue / MAX_CHANNEL],
    alpha,
  };
}

function runProperties(input: {
  readonly style: PptxSourceStyle;
  readonly runStyle: Readonly<Record<string, unknown>> | undefined;
  readonly language: string | undefined;
  readonly hyperlink: string | undefined;
  readonly fontRegistry: PptxFontRegistryV1;
}): projectFormatV1.RunProperties {
  const family = stringValue(input.runStyle, 'fontFamily') ?? input.style.fontFamily ?? 'Arial';
  const weight =
    booleanValue(input.runStyle, 'bold') === true ? BOLD_FONT_WEIGHT : (
      (numberValue(input.runStyle, 'fontWeight') ?? input.style.fontWeight ?? DEFAULT_FONT_WEIGHT)
    );
  const italic =
    booleanValue(input.runStyle, 'italic') === true ||
    input.style.fontStyle === 'italic' ||
    input.style.fontStyle === 'oblique';
  const font = input.fontRegistry.getFont({ family, weight, style: italic ? 'italic' : 'normal' });
  const properties = projectFormatV1.createRunProperties({
    fontFamilyId: font.familyId,
    fontFaceId: font.faceId,
    color: textColor(input),
    size: numberValue(input.runStyle, 'fontSize') ?? input.style.fontSize ?? DEFAULT_FONT_SIZE,
    weight,
  });

  return {
    ...properties,
    language: input.language ?? properties.language,
    semanticRole: semanticRole({ italic, weight }),
    decoration: {
      ...properties.decoration,
      underline: booleanValue(input.runStyle, 'underline') ?? false,
      strikeThrough: booleanValue(input.runStyle, 'strikeThrough') ?? false,
    },
    ...(input.hyperlink === undefined ? {} : { hyperlink: input.hyperlink }),
  };
}

function paragraphProperties(input: {
  readonly align: 'start' | 'end' | 'center' | 'justify' | undefined;
  readonly lineSpacing: number | undefined;
  readonly bulletKind: 'none' | 'char' | 'auto' | undefined;
}): projectFormatV1.ParagraphProperties {
  const properties = projectFormatV1.createParagraphProperties();
  const list = textList(input.bulletKind);

  return {
    ...properties,
    alignment: input.align ?? properties.alignment,
    lineSpacing:
      input.lineSpacing === undefined || input.lineSpacing <= 0 ?
        properties.lineSpacing
      : { kind: 'multiple', value: input.lineSpacing },
    list,
  };
}

function textBody(input: {
  readonly element: PptxSourceElement;
  readonly elementId: projectFormatV1.Id;
  readonly fontRegistry: PptxFontRegistryV1;
}): projectFormatV1.TextBody {
  const sourceParagraphs =
    isPptxSourceTextBody(input.element.content) ?
      input.element.content.paragraphs
    : [{ runs: [{ text: input.element.content }] }];

  return {
    paragraphs: sourceParagraphs.map((paragraph, paragraphIndex) => ({
      id: projectFormatV1.idSchema.parse(`${input.elementId}-paragraph-${String(paragraphIndex + 1)}`),
      properties: paragraphProperties({
        align: paragraph.props?.align,
        lineSpacing: paragraph.props?.lineSpacing,
        bulletKind: paragraph.props?.bullet?.kind,
      }),
      runs: paragraph.runs.map((run, runIndex) => ({
        id: projectFormatV1.idSchema.parse(
          `${input.elementId}-paragraph-${String(paragraphIndex + 1)}-run-${String(runIndex + 1)}`,
        ),
        text: run.text,
        properties: runProperties({
          style: input.element.style,
          runStyle: run.props?.style,
          language: run.props?.lang,
          hyperlink: run.props?.hyperlink?.url,
          fontRegistry: input.fontRegistry,
        }),
      })),
    })),
  };
}

export function mapPptxTextElementV1(input: {
  readonly source: PptxSourceElement;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id | null;
  readonly fontRegistry: PptxFontRegistryV1;
}): projectFormatV1.Element {
  const source = input.source;

  return projectFormatV1.createElementV1({
    id: input.elementId,
    name: elementName(source),
    parentId: input.parentId,
    locked: source.locked,
    geometry: projectFormatV1.createElementGeometry({
      width: Math.max(1, source.width),
      height: Math.max(1, source.height),
      transform: pptxTransform(source),
    }),
    appearance: mapPptxAppearanceV1({ style: source.style, elementId: input.elementId }),
    kind: 'text',
    text: textBody({ element: source, elementId: input.elementId, fontRegistry: input.fontRegistry }),
  });
}

export function pptxTransform(source: PptxSourceElement): projectFormatV1.ElementTransform {
  const radians = (source.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    kind: 'affine2d',
    matrix: [cosine, sine, -sine, cosine, source.position.x, source.position.y],
  };
}
