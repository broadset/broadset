import { projectFormatV1 } from '@broadset/model';
import type { Layer, TextStyle } from 'ag-psd';

import { isRgbaColor } from '../color-utils';
import { mapPsdAppearanceV1 } from './appearance';
import type { PsdFontRegistryV1 } from './font-registry';
import { psdLayerName } from './names';

const DEFAULT_FONT_FAMILY = 'Arial';
const DEFAULT_FONT_SIZE = 12;
const REGULAR_FONT_WEIGHT = 400;
const BOLD_FONT_WEIGHT = 700;
const MAX_CHANNEL = 255;
const MINIMUM_BOUND = 1;
const APPROXIMATE_CHARACTER_WIDTH = 0.5;
const LINE_HEIGHT_MULTIPLIER = 1.2;

function colorValue(color: unknown): projectFormatV1.ColorValue {
  if (!isRgbaColor(color)) return projectFormatV1.createBlackColorValue();

  return {
    kind: 'color',
    space: 'srgb',
    channels: [color.r / MAX_CHANNEL, color.g / MAX_CHANNEL, color.b / MAX_CHANNEL],
    alpha: Number.isFinite(color.a) ? color.a : 1,
  };
}

function runProperties(input: {
  readonly style: TextStyle;
  readonly fontRegistry: PsdFontRegistryV1;
}): projectFormatV1.RunProperties {
  const family = psdLayerName(input.style.font?.name, DEFAULT_FONT_FAMILY);
  const size = Number.isFinite(input.style.fontSize) && (input.style.fontSize ?? 0) > 0
    ? input.style.fontSize ?? DEFAULT_FONT_SIZE
    : DEFAULT_FONT_SIZE;
  const weight = input.style.fauxBold ? BOLD_FONT_WEIGHT : REGULAR_FONT_WEIGHT;
  const fontStyle = input.style.fauxItalic ? 'italic' : 'normal';
  const font = input.fontRegistry.getFont({ family, weight, style: fontStyle });
  const properties = projectFormatV1.createRunProperties({
    fontFamilyId: font.familyId,
    fontFaceId: font.faceId,
    size,
    weight,
    color: colorValue(input.style.fillColor),
  });

  return {
    ...properties,
    tracking: Number.isFinite(input.style.tracking) ? input.style.tracking ?? 0 : 0,
    decoration: {
      ...properties.decoration,
      underline: input.style.underline ?? false,
      strikeThrough: input.style.strikethrough ?? false,
    },
  };
}

function textRuns(input: {
  readonly text: NonNullable<Layer['text']>;
  readonly elementId: projectFormatV1.Id;
  readonly fontRegistry: PsdFontRegistryV1;
}): readonly projectFormatV1.TextRun[] {
  const fallbackStyle = input.text.style ?? {};
  const runs: projectFormatV1.TextRun[] = [];
  let cursor = 0;

  for (const styleRun of input.text.styleRuns ?? []) {
    const length = Number.isSafeInteger(styleRun.length) && styleRun.length > 0
      ? Math.min(styleRun.length, input.text.text.length - cursor)
      : 0;

    if (length <= 0) continue;

    const value = input.text.text.slice(cursor, cursor + length);
    const style: TextStyle = { ...fallbackStyle, ...styleRun.style };

    runs.push({
      id: projectFormatV1.idSchema.parse(`${input.elementId}-run-${String(runs.length + 1)}`),
      text: value,
      properties: runProperties({ style, fontRegistry: input.fontRegistry }),
    });
    cursor += length;
  }

  if (cursor < input.text.text.length || runs.length === 0) {
    runs.push({
      id: projectFormatV1.idSchema.parse(`${input.elementId}-run-${String(runs.length + 1)}`),
      text: input.text.text.slice(cursor),
      properties: runProperties({ style: fallbackStyle, fontRegistry: input.fontRegistry }),
    });
  }

  return runs;
}

export function mapPsdTextLayerV1(input: {
  readonly layer: Layer;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id;
  readonly fontRegistry: PsdFontRegistryV1;
}): projectFormatV1.Element | undefined {
  const text = input.layer.text;

  if (text === undefined) return undefined;

  const style = text.style ?? {};
  const size = Number.isFinite(style.fontSize) && (style.fontSize ?? 0) > 0
    ? style.fontSize ?? DEFAULT_FONT_SIZE
    : DEFAULT_FONT_SIZE;
  const left = Number.isFinite(input.layer.left) ? input.layer.left ?? 0 : 0;
  const top = Number.isFinite(input.layer.top) ? input.layer.top ?? 0 : 0;
  const right = Number.isFinite(input.layer.right) ? input.layer.right ?? left : left;
  const bottom = Number.isFinite(input.layer.bottom) ? input.layer.bottom ?? top : top;
  const width = Math.max(MINIMUM_BOUND, right - left, text.text.length * size * APPROXIMATE_CHARACTER_WIDTH);
  const height = Math.max(MINIMUM_BOUND, bottom - top, size * LINE_HEIGHT_MULTIPLIER);

  return projectFormatV1.createElementV1({
    id: input.elementId,
    name: psdLayerName(input.layer.name, 'PSD text layer'),
    parentId: input.parentId,
    geometry: projectFormatV1.createElementGeometry({
      width,
      height,
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, left, top] },
    }),
    appearance: mapPsdAppearanceV1({ layer: input.layer }),
    kind: 'text',
    text: {
      paragraphs: [{
        id: projectFormatV1.idSchema.parse(`${input.elementId}-paragraph-1`),
        properties: projectFormatV1.createParagraphProperties(),
        runs: textRuns({ text, elementId: input.elementId, fontRegistry: input.fontRegistry }),
      }],
    },
  });
}
