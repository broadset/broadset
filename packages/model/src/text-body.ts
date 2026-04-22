import { z } from 'zod';

import { type BroadsetColor,broadsetColorSchema } from './broadset-color';

/**
 * Phase 1 unit #9 — `TextBody` is the structured run/paragraph model
 * that will replace the flat `content: string` form on text elements.
 * `content` will become `string | TextBody`: the plain-string form is
 * retained for simple text so non-rich content isn't inflated, while
 * `TextBody` unlocks mixed-run styling (inline color, weight, link,
 * language) and paragraph-level properties (bullets, lists, indent,
 * alignment) that PSD, PPTX, and PDF importers all need a round-trip
 * home for.
 *
 * This module is additive in its first sub-commit (9a): it defines
 * the types, Zod schemas, factories, and validators. The `content`
 * field on `BroadsetElement` remains `string` until a later sub-commit
 * (9b) flips the union after the renderer / editor dual-path support
 * is in place.
 */

export type ParagraphAlign = 'start' | 'end' | 'center' | 'justify';

export type ParagraphLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Top bound on nesting depth + common presentation conventions. */
export const PARAGRAPH_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly ParagraphLevel[];

export type HyperlinkTarget = '_blank' | '_self';

export interface Hyperlink {
  readonly url: string;
  readonly tooltip?: string | undefined;
  readonly target?: HyperlinkTarget | undefined;
}

/**
 * Numbering formats common across OOXML, Apple Pages, PowerPoint, and
 * PDF tagged content. Exported as a canonical-name constant so
 * format-owned importers can map their own vocabulary onto Broadset
 * names; `AutoBullet.format` accepts any string so forward-compat is
 * preserved for formats that introduce new numbering conventions.
 */
export const CANONICAL_BULLET_FORMATS = [
  'arabicPeriod',
  'arabicParenR',
  'romanUcPeriod',
  'romanLcPeriod',
  'alphaUcPeriod',
  'alphaLcPeriod',
] as const;

export type CanonicalBulletFormat = (typeof CANONICAL_BULLET_FORMATS)[number];

export interface NoneBullet {
  readonly kind: 'none';
}

export interface CharBullet {
  readonly kind: 'char';
  readonly char: string;
  readonly font?: string | undefined;
  readonly color?: BroadsetColor | undefined;
}

export interface AutoBullet {
  readonly kind: 'auto';
  /**
   * Named OOXML-style numbering format. Prefer a value from
   * `CANONICAL_BULLET_FORMATS`; format-owned extension strings are
   * accepted for forward compatibility.
   */
  readonly format: string;
  readonly startAt?: number | undefined;
}

export type Bullet = NoneBullet | CharBullet | AutoBullet;

export interface ParagraphProps {
  readonly align?: ParagraphAlign | undefined;
  readonly indent?: number | undefined;
  readonly lineSpacing?: number | undefined;
  readonly spaceBefore?: number | undefined;
  readonly spaceAfter?: number | undefined;
  readonly bullet?: Bullet | undefined;
  readonly level?: ParagraphLevel | undefined;
}

/**
 * `RunProps` carries inline text-style overrides plus language + hyperlink
 * metadata. Style fields mirror a subset of `BroadsetElementStyle` — the
 * run schema intentionally keeps them as untyped overrides at this stage so
 * the flat style contract evolves without cascading churn. A later pass may
 * narrow the shape once the style migration stabilizes.
 */
export interface RunProps {
  readonly style?: Readonly<Record<string, unknown>> | undefined;
  /** BCP 47 tag (`en`, `fi-FI`, `ja-Hira`…) for locale-aware shaping. */
  readonly lang?: string | undefined;
  readonly hyperlink?: Hyperlink | undefined;
}

export interface Run {
  readonly text: string;
  readonly props?: RunProps | undefined;
}

export interface Paragraph {
  readonly runs: readonly Run[];
  readonly props?: ParagraphProps | undefined;
}

export interface TextBody {
  readonly paragraphs: readonly Paragraph[];
}

// ────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ────────────────────────────────────────────────────────────────────────────

const BCP47_PATTERN = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;

const hyperlinkSchema = z.object({
  url: z.string().min(1),
  tooltip: z.string().optional(),
  target: z.enum(['_blank', '_self']).optional(),
});

const noneBulletSchema = z.object({ kind: z.literal('none') });

const charBulletSchema = z.object({
  kind: z.literal('char'),
  char: z.string().min(1),
  font: z.string().optional(),
  color: broadsetColorSchema.optional(),
});

const autoBulletSchema = z.object({
  kind: z.literal('auto'),
  format: z.string().min(1),
  startAt: z.number().int().min(0).optional(),
});

export const bulletSchema: z.ZodType<Bullet> = z.discriminatedUnion('kind', [
  noneBulletSchema,
  charBulletSchema,
  autoBulletSchema,
]);

const paragraphLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);

const paragraphPropsSchema: z.ZodType<ParagraphProps> = z.object({
  align: z.enum(['start', 'end', 'center', 'justify']).optional(),
  indent: z.number().optional(),
  lineSpacing: z.number().nonnegative().optional(),
  spaceBefore: z.number().nonnegative().optional(),
  spaceAfter: z.number().nonnegative().optional(),
  bullet: bulletSchema.optional(),
  level: paragraphLevelSchema.optional(),
});

const runPropsSchema: z.ZodType<RunProps> = z.object({
  style: z.record(z.string(), z.unknown()).optional(),
  lang: z.string().regex(BCP47_PATTERN, 'lang must be a BCP 47 language tag').optional(),
  hyperlink: hyperlinkSchema.optional(),
});

const runSchema: z.ZodType<Run> = z.object({
  text: z.string(),
  props: runPropsSchema.optional(),
});

const paragraphSchema: z.ZodType<Paragraph> = z
  .object({
    runs: z.array(runSchema).min(1),
    props: paragraphPropsSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.runs.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'paragraph must contain at least one run',
        path: ['runs'],
      });
    }
  });

export const textBodySchema: z.ZodType<TextBody> = z.object({
  paragraphs: z.array(paragraphSchema).min(1),
});

// ────────────────────────────────────────────────────────────────────────────
// Factories
// ────────────────────────────────────────────────────────────────────────────

export function noneBullet(): NoneBullet {
  return { kind: 'none' };
}

export interface CharBulletOptions {
  readonly char: string;
  readonly font?: string | undefined;
  readonly color?: BroadsetColor | undefined;
}

export function charBullet(options: CharBulletOptions): CharBullet {
  return {
    kind: 'char',
    char: options.char,
    ...(options.font === undefined ? {} : { font: options.font }),
    ...(options.color === undefined ? {} : { color: options.color }),
  };
}

export interface AutoBulletOptions {
  /** Prefer a value from `CANONICAL_BULLET_FORMATS`; arbitrary strings are accepted for forward compatibility. */
  readonly format: string;
  readonly startAt?: number | undefined;
}

export function autoBullet(options: AutoBulletOptions): AutoBullet {
  return {
    kind: 'auto',
    format: options.format,
    ...(options.startAt === undefined ? {} : { startAt: options.startAt }),
  };
}

export function run(text: string, props?: RunProps): Run {
  return props === undefined ? { text } : { text, props };
}

export function paragraph(runs: readonly Run[], props?: ParagraphProps): Paragraph {
  return props === undefined ? { runs } : { runs, props };
}

export function textBody(paragraphs: readonly Paragraph[]): TextBody {
  return { paragraphs };
}

/**
 * Lossless promotion of a plain `string` `content` value to the
 * structured `TextBody` shape. `\n`-separated substrings become
 * independent paragraphs so existing fixtures that use newlines for
 * paragraph breaks preserve structure; empty strings yield an empty
 * `TextBody` (a single paragraph with a single empty run) so every
 * result remains `textBodySchema`-valid.
 */
export function textBodyFromPlainString(content: string): TextBody {
  if (content === '') {
    return textBody([paragraph([run('')])]);
  }

  return textBody(content.split('\n').map((line) => paragraph([run(line)])));
}

// ────────────────────────────────────────────────────────────────────────────
// Type guards
// ────────────────────────────────────────────────────────────────────────────

export function isTextBody(value: unknown): value is TextBody {
  return textBodySchema.safeParse(value).success;
}

export function isNoneBullet(value: Bullet): value is NoneBullet {
  return value.kind === 'none';
}

export function isCharBullet(value: Bullet): value is CharBullet {
  return value.kind === 'char';
}

export function isAutoBullet(value: Bullet): value is AutoBullet {
  return value.kind === 'auto';
}
