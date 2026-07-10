import { z } from 'zod';

import { type ColorValue, colorValueSchema } from './color';
import { type Id, idSchema } from './identity';
import { absoluteHttpsUrlSchema, axisTagSchema, nonEmptyStringSchema, validateUniqueIds } from './schema-helpers';

export interface TextTab {
  readonly id: Id;
  readonly position: number;
  readonly alignment: 'start' | 'center' | 'end' | 'decimal';
  readonly leader: 'none' | 'dots' | 'dashes' | 'line';
}

export type TextList =
  | { readonly kind: 'none' }
  | { readonly kind: 'unordered'; readonly level: number; readonly marker: 'disc' | 'circle' | 'square' | 'dash' }
  | {
      readonly kind: 'ordered';
      readonly level: number;
      readonly startAt: number;
      readonly style: 'decimal' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman';
    };

export type LineSpacing =
  | { readonly kind: 'normal' }
  | { readonly kind: 'multiple'; readonly value: number }
  | { readonly kind: 'absolute'; readonly value: number };

export interface ParagraphProperties {
  readonly alignment: 'start' | 'center' | 'end' | 'justify';
  readonly direction: 'ltr' | 'rtl' | 'auto';
  readonly lineSpacing: LineSpacing;
  readonly spaceBefore: number;
  readonly spaceAfter: number;
  readonly firstLineIndent: number;
  readonly startIndent: number;
  readonly endIndent: number;
  readonly tabs: readonly TextTab[];
  readonly list: TextList;
  readonly hyphenation: 'none' | 'manual' | 'auto';
  readonly keepTogether: boolean;
  readonly keepWithNext: boolean;
  readonly widowControl: boolean;
}

export interface FontAxisValue {
  readonly tag: string;
  readonly value: number;
}

export interface OpenTypeFeatureValue {
  readonly tag: string;
  readonly value: number;
}

export interface TextDecoration {
  readonly underline: boolean;
  readonly strikeThrough: boolean;
  readonly style: 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy';
  readonly color?: ColorValue | undefined;
}

export interface RunProperties {
  readonly fontFamilyId: Id;
  readonly fontFaceId: Id;
  readonly size: number;
  readonly color: ColorValue;
  readonly weight: number;
  readonly variationAxes: readonly FontAxisValue[];
  readonly openTypeFeatures: readonly OpenTypeFeatureValue[];
  readonly language: string;
  readonly script: string;
  readonly direction: 'ltr' | 'rtl' | 'auto';
  readonly decoration: TextDecoration;
  readonly baselineShift: number;
  readonly tracking: number;
  readonly hyperlink?: string | undefined;
  readonly semanticRole: 'none' | 'strong' | 'emphasis' | 'code' | 'citation' | 'subscript' | 'superscript';
}

export interface TextRun {
  readonly id: Id;
  readonly text: string;
  readonly properties: RunProperties;
}

export interface TextParagraph {
  readonly id: Id;
  readonly properties: ParagraphProperties;
  readonly runs: readonly TextRun[];
}

export interface TextBody {
  readonly paragraphs: readonly TextParagraph[];
}

const nonNegativeNumberSchema = z.number().nonnegative();

const lineSpacingSchema: z.ZodType<LineSpacing> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('normal') }),
  z.strictObject({ kind: z.literal('multiple'), value: z.number().positive() }),
  z.strictObject({ kind: z.literal('absolute'), value: z.number().positive() }),
]);

const textTabSchema: z.ZodType<TextTab> = z.strictObject({
  id: idSchema,
  position: nonNegativeNumberSchema,
  alignment: z.enum(['start', 'center', 'end', 'decimal']),
  leader: z.enum(['none', 'dots', 'dashes', 'line']),
});

const textListSchema: z.ZodType<TextList> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('unordered'),
    level: z.number().int().nonnegative(),
    marker: z.enum(['disc', 'circle', 'square', 'dash']),
  }),
  z.strictObject({
    kind: z.literal('ordered'),
    level: z.number().int().nonnegative(),
    startAt: z.number().int().positive(),
    style: z.enum(['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman']),
  }),
]);

export const paragraphPropertiesSchema: z.ZodType<ParagraphProperties> = z
  .strictObject({
    alignment: z.enum(['start', 'center', 'end', 'justify']),
    direction: z.enum(['ltr', 'rtl', 'auto']),
    lineSpacing: lineSpacingSchema,
    spaceBefore: nonNegativeNumberSchema,
    spaceAfter: nonNegativeNumberSchema,
    firstLineIndent: z.number(),
    startIndent: z.number(),
    endIndent: z.number(),
    tabs: z.array(textTabSchema),
    list: textListSchema,
    hyphenation: z.enum(['none', 'manual', 'auto']),
    keepTogether: z.boolean(),
    keepWithNext: z.boolean(),
    widowControl: z.boolean(),
  })
  .superRefine((properties, context) => {
    validateUniqueIds({ items: properties.tabs, context, path: ['tabs'] });
  });

const fontAxisValueSchema: z.ZodType<FontAxisValue> = z.strictObject({ tag: axisTagSchema, value: z.number() });
const openTypeFeatureValueSchema: z.ZodType<OpenTypeFeatureValue> = z.strictObject({
  tag: axisTagSchema,
  value: z.number().int().nonnegative(),
});
const textDecorationSchema: z.ZodType<TextDecoration> = z.strictObject({
  underline: z.boolean(),
  strikeThrough: z.boolean(),
  style: z.enum(['solid', 'double', 'dotted', 'dashed', 'wavy']),
  color: colorValueSchema.optional(),
});

export const runPropertiesSchema: z.ZodType<RunProperties> = z.strictObject({
  fontFamilyId: idSchema,
  fontFaceId: idSchema,
  size: z.number().positive(),
  color: colorValueSchema,
  weight: z.number().int().min(1).max(1000),
  variationAxes: z.array(fontAxisValueSchema),
  openTypeFeatures: z.array(openTypeFeatureValueSchema),
  language: nonEmptyStringSchema,
  script: z.string().regex(/^[A-Z][a-z]{3}$/u),
  direction: z.enum(['ltr', 'rtl', 'auto']),
  decoration: textDecorationSchema,
  baselineShift: z.number(),
  tracking: z.number(),
  hyperlink: absoluteHttpsUrlSchema.optional(),
  semanticRole: z.enum(['none', 'strong', 'emphasis', 'code', 'citation', 'subscript', 'superscript']),
});

function containsAuthoredMarkup(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '<') {
      continue;
    }

    const next = text[index + 1];
    const closingBracket = text.indexOf('>', index + 1);

    if (closingBracket > index && next !== undefined && (next === '/' || next === '!' || /[A-Za-z]/u.test(next))) {
      return true;
    }
  }

  return false;
}

export const textRunSchema: z.ZodType<TextRun> = z.strictObject({
  id: idSchema,
  text: z.string().refine((text) => !containsAuthoredMarkup(text), 'Authored markup is not canonical text'),
  properties: runPropertiesSchema,
});

export const textParagraphSchema: z.ZodType<TextParagraph> = z
  .strictObject({ id: idSchema, properties: paragraphPropertiesSchema, runs: z.array(textRunSchema) })
  .superRefine((paragraph, context) => {
    validateUniqueIds({ items: paragraph.runs, context, path: ['runs'] });
  });

export const textBodySchema: z.ZodType<TextBody> = z
  .strictObject({ paragraphs: z.array(textParagraphSchema) })
  .superRefine((body, context) => {
    validateUniqueIds({ items: body.paragraphs, context, path: ['paragraphs'] });
  });
