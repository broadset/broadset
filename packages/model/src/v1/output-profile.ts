import { z } from 'zod';

import { type Id, idSchema } from './identity';
import { nonEmptyStringSchema, positiveSafeIntegerSchema } from './schema-helpers';
import { type Rational, rationalSchema } from './time';

interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type DynamicRange =
  | { readonly kind: 'sdr'; readonly referenceWhiteNits: number; readonly peakNits: number }
  | {
      readonly kind: 'hdr';
      readonly format: 'hdr10' | 'hlg';
      readonly referenceWhiteNits: number;
      readonly peakNits: number;
      readonly maxCllNits?: number | undefined;
      readonly maxFallNits?: number | undefined;
    };

interface ColorSignal {
  readonly primaries: 'bt709' | 'display-p3-d65' | 'bt2020';
  readonly transfer: 'srgb' | 'bt1886' | 'pq' | 'hlg';
  readonly matrix: 'rgb' | 'bt709' | 'bt2020-ncl';
  readonly range: 'full' | 'limited';
  readonly dynamicRange: DynamicRange;
}

type MotionAlpha =
  | { readonly kind: 'none' }
  | { readonly kind: 'embedded'; readonly mode: 'straight' | 'premultiplied' }
  | { readonly kind: 'separate-key'; readonly polarity: 'normal' | 'inverted' };

type AudioRouting =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'pcm';
      readonly layout: 'mono' | 'stereo' | '5.1' | '7.1';
      readonly sampleRate: 44_100 | 48_000 | 96_000;
      readonly bitDepth: 16 | 24 | 32;
    };

type SafeArea =
  | { readonly kind: 'none' }
  | { readonly kind: 'preset'; readonly preset: 'smpte-action-title' | 'ebu-r95' }
  | { readonly kind: 'custom'; readonly action: NormalizedRect; readonly title: NormalizedRect };

interface TargetRuntime {
  readonly id: Id;
  readonly kind: 'browser' | 'broadcast-player' | 'video-file';
  readonly minimumVersion?: string | undefined;
  readonly requirements: readonly string[];
}

export interface MotionOutputProfile {
  readonly id: Id;
  readonly name: string;
  readonly kind: 'motion';
  readonly dimensions: { readonly width: number; readonly height: number };
  readonly pixelAspectRatio: Rational;
  readonly frameRate: Rational;
  readonly scan:
    | { readonly kind: 'progressive' }
    | { readonly kind: 'interlaced'; readonly fieldOrder: 'top-first' | 'bottom-first' };
  readonly colorSignal: ColorSignal;
  readonly alpha: MotionAlpha;
  readonly audioRouting: AudioRouting;
  readonly safeArea: SafeArea;
  readonly targetRuntime: TargetRuntime;
}

interface EdgeValues {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

type PdfTarget =
  | { readonly standard: 'pdf-1.7' | 'pdf-2.0'; readonly conformance: 'none' }
  | {
      readonly standard: 'pdf-x-1a:2001' | 'pdf-x-3:2002' | 'pdf-x-4' | 'pdf-x-6';
      readonly conformance: 'strict';
    };

export interface PrintOutputProfile {
  readonly id: Id;
  readonly name: string;
  readonly kind: 'print';
  readonly pageSize: { readonly width: number; readonly height: number; readonly unit: 'mm' | 'in' };
  readonly orientation: 'portrait' | 'landscape';
  readonly outputIntent: {
    readonly iccAssetId: Id;
    readonly renderingIntent: 'perceptual' | 'relative-colorimetric' | 'saturation' | 'absolute-colorimetric';
    readonly blackPointCompensation: boolean;
  };
  readonly bleed: EdgeValues;
  readonly trim: EdgeValues;
  readonly spotColorPolicy: 'preserve' | 'convert-to-process' | 'reject';
  readonly overprintPolicy: 'preserve' | 'simulate' | 'reject';
  readonly pdf: PdfTarget;
}

export type OutputProfile = MotionOutputProfile | PrintOutputProfile;

const positiveFiniteNumberSchema = z.number().positive();
const nonNegativeFiniteNumberSchema = z.number().nonnegative();

const normalizedRectSchema: z.ZodType<NormalizedRect> = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

const dynamicRangeSchema: z.ZodType<DynamicRange> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('sdr'),
    referenceWhiteNits: positiveFiniteNumberSchema,
    peakNits: positiveFiniteNumberSchema,
  }),
  z
    .strictObject({
      kind: z.literal('hdr'),
      format: z.enum(['hdr10', 'hlg']),
      referenceWhiteNits: positiveFiniteNumberSchema,
      peakNits: positiveFiniteNumberSchema,
      maxCllNits: positiveFiniteNumberSchema.optional(),
      maxFallNits: positiveFiniteNumberSchema.optional(),
    })
    .superRefine((range, context) => {
      if (range.format === 'hdr10' && (range.maxCllNits === undefined || range.maxFallNits === undefined)) {
        context.addIssue({ code: 'custom', message: 'HDR10 requires maxCLL and maxFALL metadata' });
      }
    })
    .meta({
      if: { type: 'object', properties: { format: { const: 'hdr10' } }, required: ['format'] },
      then: {
        type: 'object',
        properties: { maxCllNits: {}, maxFallNits: {} },
        required: ['maxCllNits', 'maxFallNits'],
      },
    }),
]);

const colorSignalSchema: z.ZodType<ColorSignal> = z
  .strictObject({
    primaries: z.enum(['bt709', 'display-p3-d65', 'bt2020']),
    transfer: z.enum(['srgb', 'bt1886', 'pq', 'hlg']),
    matrix: z.enum(['rgb', 'bt709', 'bt2020-ncl']),
    range: z.enum(['full', 'limited']),
    dynamicRange: dynamicRangeSchema,
  })
  .superRefine(({ transfer, dynamicRange }, context) => {
    if (dynamicRange.kind === 'sdr') {
      if (transfer === 'pq' || transfer === 'hlg') {
        context.addIssue({ code: 'custom', message: 'SDR signaling requires an SDR transfer', path: ['transfer'] });
      }

      return;
    }

    if (dynamicRange.format === 'hdr10' && transfer !== 'pq') {
      context.addIssue({ code: 'custom', message: 'HDR10 requires PQ transfer', path: ['transfer'] });
    }

    if (dynamicRange.format === 'hlg' && transfer !== 'hlg') {
      context.addIssue({ code: 'custom', message: 'HLG signaling requires HLG transfer', path: ['transfer'] });
    }
  })
  .meta({
    allOf: [
      {
        if: {
          type: 'object',
          properties: {
            dynamicRange: { type: 'object', properties: { kind: { const: 'sdr' } }, required: ['kind'] },
          },
        },
        then: { type: 'object', properties: { transfer: { enum: ['srgb', 'bt1886'] } } },
      },
      {
        if: {
          type: 'object',
          properties: {
            dynamicRange: {
              type: 'object',
              properties: { kind: { const: 'hdr' }, format: { const: 'hdr10' } },
              required: ['kind', 'format'],
            },
          },
        },
        then: { type: 'object', properties: { transfer: { const: 'pq' } } },
      },
      {
        if: {
          type: 'object',
          properties: {
            dynamicRange: {
              type: 'object',
              properties: { kind: { const: 'hdr' }, format: { const: 'hlg' } },
              required: ['kind', 'format'],
            },
          },
        },
        then: { type: 'object', properties: { transfer: { const: 'hlg' } } },
      },
    ],
  });

const alphaSchema: z.ZodType<MotionAlpha> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('embedded'), mode: z.enum(['straight', 'premultiplied']) }),
  z.strictObject({ kind: z.literal('separate-key'), polarity: z.enum(['normal', 'inverted']) }),
]);
const audioRoutingSchema: z.ZodType<AudioRouting> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('pcm'),
    layout: z.enum(['mono', 'stereo', '5.1', '7.1']),
    sampleRate: z.union([z.literal(44_100), z.literal(48_000), z.literal(96_000)]),
    bitDepth: z.union([z.literal(16), z.literal(24), z.literal(32)]),
  }),
]);
const safeAreaSchema: z.ZodType<SafeArea> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('preset'), preset: z.enum(['smpte-action-title', 'ebu-r95']) }),
  z.strictObject({ kind: z.literal('custom'), action: normalizedRectSchema, title: normalizedRectSchema }),
]);
const targetRuntimeSchema: z.ZodType<TargetRuntime> = z
  .strictObject({
    id: idSchema,
    kind: z.enum(['browser', 'broadcast-player', 'video-file']),
    minimumVersion: nonEmptyStringSchema.optional(),
    requirements: z.array(nonEmptyStringSchema).meta({ uniqueItems: true }),
  })
  .superRefine(({ requirements }, context) => {
    const seen = new Set<string>();

    requirements.forEach((requirement, index) => {
      if (seen.has(requirement)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate runtime requirement: ${requirement}`,
          path: ['requirements', index],
        });
      }

      seen.add(requirement);
    });
  });

export const motionOutputProfileSchema: z.ZodType<MotionOutputProfile> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  kind: z.literal('motion'),
  dimensions: z.strictObject({ width: positiveSafeIntegerSchema, height: positiveSafeIntegerSchema }),
  pixelAspectRatio: rationalSchema,
  frameRate: rationalSchema,
  scan: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('progressive') }),
    z.strictObject({ kind: z.literal('interlaced'), fieldOrder: z.enum(['top-first', 'bottom-first']) }),
  ]),
  colorSignal: colorSignalSchema,
  alpha: alphaSchema,
  audioRouting: audioRoutingSchema,
  safeArea: safeAreaSchema,
  targetRuntime: targetRuntimeSchema,
});

const edgeValuesSchema: z.ZodType<EdgeValues> = z.strictObject({
  top: nonNegativeFiniteNumberSchema,
  right: nonNegativeFiniteNumberSchema,
  bottom: nonNegativeFiniteNumberSchema,
  left: nonNegativeFiniteNumberSchema,
});
const pdfTargetSchema: z.ZodType<PdfTarget> = z.union([
  z.strictObject({ standard: z.enum(['pdf-1.7', 'pdf-2.0']), conformance: z.literal('none') }),
  z.strictObject({
    standard: z.enum(['pdf-x-1a:2001', 'pdf-x-3:2002', 'pdf-x-4', 'pdf-x-6']),
    conformance: z.literal('strict'),
  }),
]);

export const printOutputProfileSchema: z.ZodType<PrintOutputProfile> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  kind: z.literal('print'),
  pageSize: z.strictObject({
    width: positiveFiniteNumberSchema,
    height: positiveFiniteNumberSchema,
    unit: z.enum(['mm', 'in']),
  }),
  orientation: z.enum(['portrait', 'landscape']),
  outputIntent: z.strictObject({
    iccAssetId: idSchema,
    renderingIntent: z.enum(['perceptual', 'relative-colorimetric', 'saturation', 'absolute-colorimetric']),
    blackPointCompensation: z.boolean(),
  }),
  bleed: edgeValuesSchema,
  trim: edgeValuesSchema,
  spotColorPolicy: z.enum(['preserve', 'convert-to-process', 'reject']),
  overprintPolicy: z.enum(['preserve', 'simulate', 'reject']),
  pdf: pdfTargetSchema,
});

export const outputProfileSchema: z.ZodType<OutputProfile> = z.union([
  motionOutputProfileSchema,
  printOutputProfileSchema,
]);
