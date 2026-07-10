import { z } from 'zod';

import {
  type Id,
  idSchema,
  type Sha256Digest,
  sha256DigestSchema,
  type UtcTimestamp,
  utcTimestampSchema,
} from './identity';
import {
  absoluteHttpsUrlSchema,
  axisTagSchema,
  finiteNumberSchema,
  greatestCommonDivisor,
  mediaTypeSchema,
  nonEmptyStringSchema,
  nonNegativeSafeIntegerSchema,
  packagePathSchema,
  positiveSafeIntegerSchema,
  validateUniqueIds,
} from './schema-helpers';
import { type TypedValue, type ValueType, valueTypeSchema } from './typed-value';

export type BlobSource =
  | { readonly kind: 'package'; readonly path: string }
  | {
      readonly kind: 'external';
      readonly url: string;
      readonly integrity: Sha256Digest;
      readonly cachedDigest?: Sha256Digest | undefined;
    }
  | { readonly kind: 'missing'; readonly lastKnownName?: string | undefined };

export interface BlobReference {
  readonly digest: Sha256Digest;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly source: BlobSource;
}

export type AssetProvenance =
  | { readonly kind: 'created'; readonly application: string; readonly createdAt?: UtcTimestamp | undefined }
  | {
      readonly kind: 'imported';
      readonly sourceName: string;
      readonly sourceUri?: string | undefined;
      readonly importer: string;
      readonly importedAt: UtcTimestamp;
    };

export interface AssetLicense {
  readonly name: string;
  readonly spdxIdentifier?: string | undefined;
  readonly url?: string | undefined;
  readonly attribution?: string | undefined;
  readonly permissions: {
    readonly embedding: boolean;
    readonly modification: boolean;
    readonly redistribution: boolean;
  };
}

export interface AssetDerivative {
  readonly id: Id;
  readonly role: 'preview' | 'proxy' | 'thumbnail' | 'optimized';
  readonly name: string;
  readonly blob: BlobReference;
}

export interface AssetBase {
  readonly id: Id;
  readonly name: string;
  readonly blob: BlobReference;
  readonly provenance?: AssetProvenance | undefined;
  readonly license?: AssetLicense | undefined;
  readonly derivatives?: readonly AssetDerivative[] | undefined;
}

export interface ImageAsset extends AssetBase {
  readonly kind: 'image';
  readonly metadata: {
    readonly pixelWidth: number;
    readonly pixelHeight: number;
    readonly orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    readonly hasAlpha: boolean;
    readonly bitDepth: number;
    readonly colorModel: 'gray' | 'rgb' | 'cmyk' | 'lab' | 'indexed' | 'unknown';
    readonly iccProfileAssetId?: Id | undefined;
  };
}

export interface VideoAsset extends AssetBase {
  readonly kind: 'video';
  readonly metadata: {
    readonly pixelWidth: number;
    readonly pixelHeight: number;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly durationTicks: number;
    readonly videoCodec: string;
    readonly hasAlpha: boolean;
    readonly audioTracks: readonly {
      readonly id: Id;
      readonly codec: string;
      readonly sampleRate: number;
      readonly channelCount: number;
      readonly language?: string | undefined;
    }[];
  };
}

export interface AudioAsset extends AssetBase {
  readonly kind: 'audio';
  readonly metadata: {
    readonly durationTicks: number;
    readonly sampleRate: number;
    readonly channelCount: number;
    readonly channelLayout: string;
    readonly codec: string;
  };
}

export interface FontAsset extends AssetBase {
  readonly kind: 'font';
  readonly metadata: {
    readonly format: 'opentype' | 'truetype' | 'woff' | 'woff2' | 'type1' | 'collection';
    readonly postScriptName: string;
    readonly family: string;
    readonly weight: number;
    readonly style: 'normal' | 'italic' | 'oblique';
    readonly stretch: number;
    readonly variableAxes: readonly {
      readonly id: Id;
      readonly tag: string;
      readonly minimum: number;
      readonly defaultValue: number;
      readonly maximum: number;
    }[];
    readonly unicodeCoverage: readonly { readonly id: Id; readonly start: number; readonly end: number }[];
    readonly embeddingPermissions: 'installable' | 'editable' | 'preview-print' | 'restricted';
  };
}

export interface IccProfileAsset extends AssetBase {
  readonly kind: 'icc-profile';
  readonly metadata: {
    readonly profileClass: 'input' | 'display' | 'output' | 'device-link' | 'color-space' | 'abstract' | 'named-color';
    readonly colorSpace: string;
    readonly profileConnectionSpace: 'xyz' | 'lab';
    readonly description: string;
    readonly identifier: string;
  };
}

export interface DataAsset extends AssetBase {
  readonly kind: 'data';
  readonly metadata: {
    readonly encoding: string;
    readonly schemaUri?: string | undefined;
    readonly recordShape:
      | { readonly kind: 'opaque' }
      | {
          readonly kind: 'records' | 'tabular';
          readonly fields: readonly {
            readonly id: Id;
            readonly name: string;
            readonly valueType: ValueType;
            readonly nullable: boolean;
          }[];
        };
  };
}

export interface VectorAsset extends AssetBase {
  readonly kind: 'vector';
  readonly metadata: AssetIntrinsicMetadata;
}

export interface ForeignAsset extends AssetBase {
  readonly kind: 'foreign';
  readonly metadata: AssetIntrinsicMetadata;
}

export interface AssetIntrinsicMetadata {
  readonly intrinsicBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly safePreviewAssetId?: Id | undefined;
}

export type Asset =
  | ImageAsset
  | VideoAsset
  | AudioAsset
  | FontAsset
  | IccProfileAsset
  | DataAsset
  | VectorAsset
  | ForeignAsset;

export interface FontFamilyResource {
  readonly id: Id;
  readonly familyName: string;
  readonly fallbackFontIds: readonly Id[];
  readonly faces: readonly FontFaceResource[];
}

export interface FontFaceResource {
  readonly id: Id;
  readonly source:
    | { readonly kind: 'asset'; readonly assetId: Id }
    | { readonly kind: 'system'; readonly postScriptName: string };
  readonly weight: number;
  readonly style: 'normal' | 'italic' | 'oblique';
  readonly stretch: number;
  readonly axes?: Readonly<Record<string, number>> | undefined;
}

export interface VariableCollection {
  readonly id: Id;
  readonly name: string;
  readonly modes: readonly { readonly id: Id; readonly name: string }[];
  readonly defaultModeId: Id;
  readonly variables: readonly VariableDefinition[];
}

export interface VariableDefinition {
  readonly id: Id;
  readonly name: string;
  readonly valueType: ValueType;
  readonly valuesByMode: Readonly<Record<Id, TypedValue>>;
  readonly aliasOf?: { readonly collectionId: Id; readonly variableId: Id } | undefined;
}

export interface SharedStyle {
  readonly id: Id;
  readonly name: string;
  readonly kind: 'appearance' | 'text';
  readonly source:
    | {
        readonly kind: 'properties';
        readonly inheritedStyleId?: Id | undefined;
        readonly entries: readonly {
          readonly id: Id;
          readonly pointer: string;
          readonly value: TypedValue;
        }[];
      }
    | { readonly kind: 'alias'; readonly styleId: Id };
}

const packageBlobSourceSchema = z.strictObject({ kind: z.literal('package'), path: packagePathSchema });
const externalBlobSourceSchema = z.strictObject({
  kind: z.literal('external'),
  url: absoluteHttpsUrlSchema,
  integrity: sha256DigestSchema,
  cachedDigest: sha256DigestSchema.optional(),
});
const missingBlobSourceSchema = z.strictObject({
  kind: z.literal('missing'),
  lastKnownName: nonEmptyStringSchema.optional(),
});

export const blobReferenceSchema: z.ZodType<BlobReference> = z
  .strictObject({
    digest: sha256DigestSchema,
    byteLength: nonNegativeSafeIntegerSchema,
    mediaType: mediaTypeSchema,
    source: z.discriminatedUnion('kind', [packageBlobSourceSchema, externalBlobSourceSchema, missingBlobSourceSchema]),
  })
  .superRefine((blobReference, context) => {
    if (
      blobReference.source.kind === 'package' &&
      blobReference.source.path !== `blobs/sha256/${blobReference.digest.slice('sha256:'.length)}`
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Package blob path must match its digest',
        path: ['source', 'path'],
      });
    }

    if (blobReference.source.kind === 'external' && blobReference.source.integrity !== blobReference.digest) {
      context.addIssue({
        code: 'custom',
        message: 'External integrity must match its digest',
        path: ['source', 'integrity'],
      });
    }

    if (
      blobReference.source.kind === 'external' &&
      blobReference.source.cachedDigest !== undefined &&
      blobReference.source.cachedDigest !== blobReference.digest
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Cached digest must match its digest',
        path: ['source', 'cachedDigest'],
      });
    }
  });

const provenanceSchema: z.ZodType<AssetProvenance> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('created'),
    application: nonEmptyStringSchema,
    createdAt: utcTimestampSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('imported'),
    sourceName: nonEmptyStringSchema,
    sourceUri: z.url().optional(),
    importer: nonEmptyStringSchema,
    importedAt: utcTimestampSchema,
  }),
]);
const licenseSchema: z.ZodType<AssetLicense> = z.strictObject({
  name: nonEmptyStringSchema,
  spdxIdentifier: nonEmptyStringSchema.optional(),
  url: z.url().optional(),
  attribution: nonEmptyStringSchema.optional(),
  permissions: z.strictObject({ embedding: z.boolean(), modification: z.boolean(), redistribution: z.boolean() }),
});
const derivativeSchema: z.ZodType<AssetDerivative> = z.strictObject({
  id: idSchema,
  role: z.enum(['preview', 'proxy', 'thumbnail', 'optimized']),
  name: nonEmptyStringSchema,
  blob: blobReferenceSchema,
});
const assetBaseShape = {
  id: idSchema,
  name: nonEmptyStringSchema,
  blob: blobReferenceSchema,
  provenance: provenanceSchema.optional(),
  license: licenseSchema.optional(),
  derivatives: z.array(derivativeSchema).optional(),
};

const imageAssetSchema = z.strictObject({
  ...assetBaseShape,
  kind: z.literal('image'),
  metadata: z.strictObject({
    pixelWidth: positiveSafeIntegerSchema,
    pixelHeight: positiveSafeIntegerSchema,
    orientation: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(8),
    ]),
    hasAlpha: z.boolean(),
    bitDepth: positiveSafeIntegerSchema,
    colorModel: z.enum(['gray', 'rgb', 'cmyk', 'lab', 'indexed', 'unknown']),
    iccProfileAssetId: idSchema.optional(),
  }),
});
const audioTrackSchema = z.strictObject({
  id: idSchema,
  codec: nonEmptyStringSchema,
  sampleRate: positiveSafeIntegerSchema,
  channelCount: positiveSafeIntegerSchema,
  language: nonEmptyStringSchema.optional(),
});
const frameRateSchema = z
  .strictObject({ numerator: positiveSafeIntegerSchema, denominator: positiveSafeIntegerSchema })
  .superRefine((frameRate, context) => {
    if (greatestCommonDivisor(frameRate.numerator, frameRate.denominator) !== 1) {
      context.addIssue({ code: 'custom', message: 'Frame rate must be reduced' });
    }
  });
const videoAssetSchema = z.strictObject({
  ...assetBaseShape,
  kind: z.literal('video'),
  metadata: z
    .strictObject({
      pixelWidth: positiveSafeIntegerSchema,
      pixelHeight: positiveSafeIntegerSchema,
      frameRate: frameRateSchema,
      durationTicks: nonNegativeSafeIntegerSchema,
      videoCodec: nonEmptyStringSchema,
      hasAlpha: z.boolean(),
      audioTracks: z.array(audioTrackSchema),
    })
    .superRefine((metadata, context) => {
      validateUniqueIds({ items: metadata.audioTracks, context, path: ['audioTracks'] });
    }),
});
const audioAssetSchema = z.strictObject({
  ...assetBaseShape,
  kind: z.literal('audio'),
  metadata: z.strictObject({
    durationTicks: nonNegativeSafeIntegerSchema,
    sampleRate: positiveSafeIntegerSchema,
    channelCount: positiveSafeIntegerSchema,
    channelLayout: nonEmptyStringSchema,
    codec: nonEmptyStringSchema,
  }),
});
const variableAxisSchema = z
  .strictObject({
    id: idSchema,
    tag: axisTagSchema,
    minimum: finiteNumberSchema,
    defaultValue: finiteNumberSchema,
    maximum: finiteNumberSchema,
  })
  .superRefine((axis, context) => {
    if (axis.minimum > axis.defaultValue || axis.defaultValue > axis.maximum) {
      context.addIssue({ code: 'custom', message: 'Axis default must be within its range' });
    }
  });
const unicodeRangeSchema = z
  .strictObject({
    id: idSchema,
    start: z.number().int().min(0).max(0x10ffff),
    end: z.number().int().min(0).max(0x10ffff),
  })
  .superRefine((range, context) => {
    if (range.start > range.end || (range.start <= 0xdfff && range.end >= 0xd800)) {
      context.addIssue({ code: 'custom', message: 'Expected an ordered Unicode scalar range' });
    }
  });
const fontAssetSchema = z.strictObject({
  ...assetBaseShape,
  kind: z.literal('font'),
  metadata: z
    .strictObject({
      format: z.enum(['opentype', 'truetype', 'woff', 'woff2', 'type1', 'collection']),
      postScriptName: nonEmptyStringSchema,
      family: nonEmptyStringSchema,
      weight: z.number().int().min(1).max(1000),
      style: z.enum(['normal', 'italic', 'oblique']),
      stretch: z.number().positive(),
      variableAxes: z.array(variableAxisSchema),
      unicodeCoverage: z.array(unicodeRangeSchema),
      embeddingPermissions: z.enum(['installable', 'editable', 'preview-print', 'restricted']),
    })
    .superRefine((metadata, context) => {
      validateUniqueIds({ items: metadata.variableAxes, context, path: ['variableAxes'] });
      validateUniqueIds({ items: metadata.unicodeCoverage, context, path: ['unicodeCoverage'] });
    }),
});
const iccProfileAssetSchema = z.strictObject({
  ...assetBaseShape,
  kind: z.literal('icc-profile'),
  metadata: z.strictObject({
    profileClass: z.enum(['input', 'display', 'output', 'device-link', 'color-space', 'abstract', 'named-color']),
    colorSpace: nonEmptyStringSchema,
    profileConnectionSpace: z.enum(['xyz', 'lab']),
    description: nonEmptyStringSchema,
    identifier: nonEmptyStringSchema,
  }),
});
const dataFieldSchema = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  valueType: valueTypeSchema,
  nullable: z.boolean(),
});
const shapedDataRecordSchema = z.union([
  z.strictObject({ kind: z.literal('records'), fields: z.array(dataFieldSchema) }),
  z.strictObject({ kind: z.literal('tabular'), fields: z.array(dataFieldSchema) }),
]);
const dataAssetSchema = z.strictObject({
  ...assetBaseShape,
  kind: z.literal('data'),
  metadata: z.strictObject({
    encoding: nonEmptyStringSchema,
    schemaUri: z.url().optional(),
    recordShape: z.union([
      z.strictObject({ kind: z.literal('opaque') }),
      shapedDataRecordSchema.superRefine((recordShape, context) => {
        validateUniqueIds({ items: recordShape.fields, context, path: ['fields'] });
      }),
    ]),
  }),
});
const intrinsicMetadataSchema = z.strictObject({
  intrinsicBounds: z.strictObject({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    width: finiteNumberSchema.positive(),
    height: finiteNumberSchema.positive(),
  }),
  safePreviewAssetId: idSchema.optional(),
});
const vectorAssetSchema = z.strictObject({
  ...assetBaseShape,
  kind: z.literal('vector'),
  metadata: intrinsicMetadataSchema,
});
const foreignAssetSchema = z.strictObject({
  ...assetBaseShape,
  kind: z.literal('foreign'),
  metadata: intrinsicMetadataSchema,
});

export const assetSchema: z.ZodType<Asset> = z
  .discriminatedUnion('kind', [
    imageAssetSchema,
    videoAssetSchema,
    audioAssetSchema,
    fontAssetSchema,
    iccProfileAssetSchema,
    dataAssetSchema,
    vectorAssetSchema,
    foreignAssetSchema,
  ])
  .superRefine((asset, context) => {
    validateUniqueIds({ items: asset.derivatives ?? [], context, path: ['derivatives'] });
  });

export {
  fontFamilyResourceSchema,
  sharedStyleSchema,
  swatchSchema,
  variableCollectionSchema,
} from './resource-collections';
