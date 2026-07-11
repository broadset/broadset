import type { projectFormatV1 } from '@broadset/model';

import { colorValueToCss, formatCssNumber } from './paint-css';

type RunProperties = projectFormatV1.RunProperties;
type ParagraphProperties = projectFormatV1.ParagraphProperties;
type FontFamilyResource = projectFormatV1.FontFamilyResource;
type Swatch = projectFormatV1.Swatch;
type Id = projectFormatV1.Id;

const AUTO_DIRECTION = 'auto';
const NO_HYPHENATION = 'none';
const NO_SEMANTIC_ROLE = 'none';
const PIXEL_UNIT = 'px';
const QUOTATION_MARK = '"';
const SETTING_SEPARATOR = ', ';
const WHITESPACE_PATTERN = /\s/u;

/** CSS properties derived from a v1 text run. Only applicable optional properties are present. */
export interface TextRunStyle {
  readonly fontFamily?: string;
  readonly fontSize: string;
  readonly color: string;
  readonly fontWeight: string;
  readonly letterSpacing?: string;
  readonly textDecorationLine?: string;
  readonly textDecorationStyle?: string;
  readonly textDecorationColor?: string;
  readonly direction?: string;
  readonly fontVariationSettings?: string;
  readonly fontFeatureSettings?: string;
  readonly verticalAlign?: string;
}

/** CSS properties derived from a v1 paragraph. Only applicable optional properties are present. */
export interface TextParagraphStyle {
  readonly textAlign: string;
  readonly direction?: string;
  readonly lineHeight?: string;
  readonly marginTop?: string;
  readonly marginBottom?: string;
  readonly textIndent?: string;
  readonly paddingInlineStart?: string;
  readonly paddingInlineEnd?: string;
  readonly hyphens?: string;
}

function pixels(value: number): string {
  return `${formatCssNumber(value)}${PIXEL_UNIT}`;
}

function fontFamilyToCss(font: FontFamilyResource | undefined): string | undefined {
  if (font === undefined) return undefined;

  return WHITESPACE_PATTERN.test(font.familyName)
    ? `${QUOTATION_MARK}${font.familyName}${QUOTATION_MARK}`
    : font.familyName;
}

function decorationLine(run: RunProperties): string | undefined {
  const lines = [
    ...(run.decoration.underline ? ['underline'] : []),
    ...(run.decoration.strikeThrough ? ['line-through'] : []),
  ];

  return lines.length > 0 ? lines.join(' ') : undefined;
}

function taggedSettings(values: readonly { readonly tag: string; readonly value: number }[]): string | undefined {
  if (values.length === 0) return undefined;

  return values
    .map(({ tag, value }) => `${QUOTATION_MARK}${tag}${QUOTATION_MARK} ${formatCssNumber(value)}`)
    .join(SETTING_SEPARATOR);
}

function verticalAlignment(run: RunProperties): string | undefined {
  if (run.semanticRole === 'subscript') return 'sub';
  if (run.semanticRole === 'superscript') return 'super';

  return run.semanticRole === NO_SEMANTIC_ROLE && run.baselineShift !== 0 ? pixels(run.baselineShift) : undefined;
}

/** Map v1 run properties to CSS, failing softly to inherited font-family when its resource is missing. */
export function runToStyle(
  run: RunProperties,
  fonts: ReadonlyMap<Id, FontFamilyResource>,
  swatches: ReadonlyMap<Id, Swatch>,
): TextRunStyle {
  const fontFamily = fontFamilyToCss(fonts.get(run.fontFamilyId));
  const textDecorationLine = decorationLine(run);
  const fontVariationSettings = taggedSettings(run.variationAxes);
  const fontFeatureSettings = taggedSettings(run.openTypeFeatures);
  const verticalAlign = verticalAlignment(run);

  return {
    ...(fontFamily !== undefined ? { fontFamily } : {}),
    fontSize: pixels(run.size),
    color: colorValueToCss(run.color, swatches),
    fontWeight: formatCssNumber(run.weight),
    ...(run.tracking !== 0 ? { letterSpacing: pixels(run.tracking) } : {}),
    ...(textDecorationLine !== undefined
      ? { textDecorationLine, textDecorationStyle: run.decoration.style }
      : {}),
    ...(run.decoration.color !== undefined
      ? { textDecorationColor: colorValueToCss(run.decoration.color, swatches) }
      : {}),
    ...(run.direction !== AUTO_DIRECTION ? { direction: run.direction } : {}),
    ...(fontVariationSettings !== undefined ? { fontVariationSettings } : {}),
    ...(fontFeatureSettings !== undefined ? { fontFeatureSettings } : {}),
    ...(verticalAlign !== undefined ? { verticalAlign } : {}),
  };
}

/**
 * Map v1 paragraph properties to direct CSS equivalents. Lists, tabs, keep-together, keep-with-next,
 * and widow control have no clean single CSS property and are intentionally omitted.
 */
export function paragraphToStyle(paragraph: ParagraphProperties): TextParagraphStyle {
  return {
    textAlign: paragraph.alignment,
    ...(paragraph.direction !== AUTO_DIRECTION ? { direction: paragraph.direction } : {}),
    ...(paragraph.lineSpacing.kind === 'multiple'
      ? { lineHeight: formatCssNumber(paragraph.lineSpacing.value) }
      : {}),
    ...(paragraph.spaceBefore !== 0 ? { marginTop: pixels(paragraph.spaceBefore) } : {}),
    ...(paragraph.spaceAfter !== 0 ? { marginBottom: pixels(paragraph.spaceAfter) } : {}),
    ...(paragraph.firstLineIndent !== 0 ? { textIndent: pixels(paragraph.firstLineIndent) } : {}),
    ...(paragraph.startIndent !== 0 ? { paddingInlineStart: pixels(paragraph.startIndent) } : {}),
    ...(paragraph.endIndent !== 0 ? { paddingInlineEnd: pixels(paragraph.endIndent) } : {}),
    ...(paragraph.hyphenation !== NO_HYPHENATION ? { hyphens: paragraph.hyphenation } : {}),
  };
}
