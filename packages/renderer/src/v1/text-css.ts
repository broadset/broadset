import type { projectFormatV1 } from '@broadset/model';

import { colorValueToCss, formatCssNumber } from './paint-css';
import { type PhysicalUnitContextV1, spatialValueToCssPixelsV1 } from './physical-units';

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
const PIXEL_CONTEXT: PhysicalUnitContextV1 = { unit: 'px', dpi: 96 };

/** CSS properties derived from a v1 text run. Only applicable optional properties are present. */
export interface TextRunStyle extends Readonly<Record<string, string | undefined>> {
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
export interface TextParagraphStyle extends Readonly<Record<string, string | undefined>> {
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

function pixels(value: number, units: PhysicalUnitContextV1): string {
  return `${formatCssNumber(spatialValueToCssPixelsV1(value, units))}${PIXEL_UNIT}`;
}

function quotedCssString(value: string): string {
  const escaped = value.replaceAll('\\', '\\\\').replaceAll(QUOTATION_MARK, `\\${QUOTATION_MARK}`);

  return `${QUOTATION_MARK}${escaped}${QUOTATION_MARK}`;
}

function requiresQuotedCssString(value: string): boolean {
  return WHITESPACE_PATTERN.test(value) || value.includes(QUOTATION_MARK) || value.includes("'") || value.includes('\\');
}

function fontFamilyToCss(font: FontFamilyResource | undefined): string | undefined {
  if (font === undefined) return undefined;

  return requiresQuotedCssString(font.familyName) ? quotedCssString(font.familyName) : font.familyName;
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

function verticalAlignment(run: RunProperties, units: PhysicalUnitContextV1): string | undefined {
  if (run.semanticRole === 'subscript') return 'sub';
  if (run.semanticRole === 'superscript') return 'super';

  return run.semanticRole === NO_SEMANTIC_ROLE && run.baselineShift !== 0 ?
      pixels(run.baselineShift, units)
    : undefined;
}

/** Map v1 run properties to CSS with explicit physical-unit conversion. */
export function runToStyleV1(options: {
  readonly run: RunProperties;
  readonly fonts: ReadonlyMap<Id, FontFamilyResource>;
  readonly swatches: ReadonlyMap<Id, Swatch>;
  readonly units: PhysicalUnitContextV1;
}): TextRunStyle {
  const { run, fonts, swatches, units } = options;
  const fontFamily = fontFamilyToCss(fonts.get(run.fontFamilyId));
  const textDecorationLine = decorationLine(run);
  const fontVariationSettings = taggedSettings(run.variationAxes);
  const fontFeatureSettings = taggedSettings(run.openTypeFeatures);
  const verticalAlign = verticalAlignment(run, units);

  return {
    ...(fontFamily !== undefined ? { fontFamily } : {}),
    fontSize: pixels(run.size, units),
    color: colorValueToCss(run.color, swatches),
    fontWeight: formatCssNumber(run.weight),
    ...(run.tracking !== 0 ? { letterSpacing: pixels(run.tracking, units) } : {}),
    ...(textDecorationLine !== undefined ? { textDecorationLine, textDecorationStyle: run.decoration.style } : {}),
    ...(run.decoration.color !== undefined ?
      { textDecorationColor: colorValueToCss(run.decoration.color, swatches) }
    : {}),
    ...(run.direction !== AUTO_DIRECTION ? { direction: run.direction } : {}),
    ...(fontVariationSettings !== undefined ? { fontVariationSettings } : {}),
    ...(fontFeatureSettings !== undefined ? { fontFeatureSettings } : {}),
    ...(verticalAlign !== undefined ? { verticalAlign } : {}),
  };
}

/** Map v1 run properties to CSS, failing softly to inherited font-family when its resource is missing. */
export function runToStyle(
  run: RunProperties,
  fonts: ReadonlyMap<Id, FontFamilyResource>,
  swatches: ReadonlyMap<Id, Swatch>,
): TextRunStyle {
  return runToStyleV1({ run, fonts, swatches, units: PIXEL_CONTEXT });
}

/**
 * Map v1 paragraph properties to direct CSS equivalents. Lists, tabs, keep-together, keep-with-next,
 * and widow control have no clean single CSS property and are intentionally omitted.
 */
export function paragraphToStyle(
  paragraph: ParagraphProperties,
  units: PhysicalUnitContextV1 = PIXEL_CONTEXT,
): TextParagraphStyle {
  let lineHeight: string | undefined;

  if (paragraph.lineSpacing.kind === 'multiple') {
    lineHeight = formatCssNumber(paragraph.lineSpacing.value);
  } else if (paragraph.lineSpacing.kind === 'absolute') {
    lineHeight = pixels(paragraph.lineSpacing.value, units);
  }

  return {
    textAlign: paragraph.alignment,
    ...(paragraph.direction !== AUTO_DIRECTION ? { direction: paragraph.direction } : {}),
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(paragraph.spaceBefore !== 0 ? { marginTop: pixels(paragraph.spaceBefore, units) } : {}),
    ...(paragraph.spaceAfter !== 0 ? { marginBottom: pixels(paragraph.spaceAfter, units) } : {}),
    ...(paragraph.firstLineIndent !== 0 ? { textIndent: pixels(paragraph.firstLineIndent, units) } : {}),
    ...(paragraph.startIndent !== 0 ? { paddingInlineStart: pixels(paragraph.startIndent, units) } : {}),
    ...(paragraph.endIndent !== 0 ? { paddingInlineEnd: pixels(paragraph.endIndent, units) } : {}),
    ...(paragraph.hyphenation !== NO_HYPHENATION ? { hyphens: paragraph.hyphenation } : {}),
  };
}
