import { z } from 'zod';

/**
 * Phase 4 unit #1 — `Asset` becomes a discriminated union over `kind`
 * so font-specific fidelity fields (`format`, `postScriptName`,
 * `familyName`, `subsetRanges?`) live on `FontAsset` without leaking
 * into image / video / audio / data assets.
 *
 * The common asset base keeps `id`, `name`, `mimeType`, `source`, and
 * the shared optional `fileSizeBytes` / `metadata`. Subsequent Phase 4
 * units replace `source`-URL with byte blobs for images (P4.2), add
 * the `icc-profile` kind (P4.4), and surface font embed-permission on
 * the asset record itself (P4.6). Only the font variant is tightened
 * in this unit so the refactor surface stays reviewable.
 */

// ────────────────────────────────────────────────────────────────────────────
// Common asset base
// ────────────────────────────────────────────────────────────────────────────

/** Source of truth for locating asset bytes at runtime. */
export type AssetSource =
  | { readonly type: 'url'; readonly url: string }
  | { readonly type: 'embedded'; readonly dataUri: string }
  | { readonly type: 'file'; readonly path: string };

export type AssetKind = 'image' | 'video' | 'font' | 'audio' | 'data';

export interface AssetBase {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly source: AssetSource;
  readonly fileSizeBytes?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Font-specific fields
// ────────────────────────────────────────────────────────────────────────────

/**
 * Embeddable font formats every current format track can round-trip:
 * WOFF2 for web / SVG `@font-face`, TTF / OTF for PDF and PPTX font
 * tables.
 */
export type FontFormat = 'woff2' | 'ttf' | 'otf';

/**
 * Inclusive Unicode codepoint range. Mirrors CSS `unicode-range` and
 * the shape used by `_shared/fonts/subset.ts` (Phase 4 P4.5). Both
 * endpoints are integer codepoints in `[0, 0x10FFFF]` with
 * `start <= end`.
 */
export interface UnicodeRange {
  readonly start: number;
  readonly end: number;
}

export interface FontAsset extends AssetBase {
  readonly kind: 'font';
  readonly format: FontFormat;
  /** PostScript name required by PDF `/BaseFont` and PPTX `rPr` typeface. */
  readonly postScriptName: string;
  /** Human-readable family name used by CSS `font-family` and editor pickers. */
  readonly familyName: string;
  /** Declared Unicode coverage — required by the subsetting pipeline (P4.5). */
  readonly subsetRanges?: readonly UnicodeRange[] | undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Other asset variants (tightened in later Phase 4 units)
// ────────────────────────────────────────────────────────────────────────────

export interface ImageAsset extends AssetBase {
  readonly kind: 'image';
}

export interface VideoAsset extends AssetBase {
  readonly kind: 'video';
}

export interface AudioAsset extends AssetBase {
  readonly kind: 'audio';
}

export interface DataAsset extends AssetBase {
  readonly kind: 'data';
}

export type Asset = FontAsset | ImageAsset | VideoAsset | AudioAsset | DataAsset;

// ────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ────────────────────────────────────────────────────────────────────────────

const MAX_UNICODE_CODEPOINT = 0x10ffff;

const assetSourceSchema = z.union([
  z.object({ type: z.literal('url'), url: z.string().min(1) }),
  z.object({ type: z.literal('embedded'), dataUri: z.string().min(1) }),
  z.object({ type: z.literal('file'), path: z.string().min(1) }),
]);

const unicodeCodepointSchema = z.number().int().min(0).max(MAX_UNICODE_CODEPOINT);

const unicodeRangeSchema = z
  .object({
    start: unicodeCodepointSchema,
    end: unicodeCodepointSchema,
  })
  .refine((range) => range.start <= range.end, {
    message: 'UnicodeRange start must be <= end',
  });

/**
 * PostScript names are ASCII tokens (Adobe PostScript Language
 * Reference, Appendix E) — no spaces and no reserved punctuation. The
 * practical allowlist covers `A-Za-z0-9._+-` which is sufficient for
 * every font a format track embeds while rejecting the accidental
 * family-name paste (which contains whitespace).
 */
const POSTSCRIPT_NAME_PATTERN = /^[A-Za-z0-9._+-]+$/;

const fontFormatSchema = z.enum(['woff2', 'ttf', 'otf']);

const assetBaseFields = {
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  source: assetSourceSchema,
  fileSizeBytes: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
} as const;

const fontAssetSchema = z.object({
  ...assetBaseFields,
  kind: z.literal('font'),
  format: fontFormatSchema,
  postScriptName: z.string().min(1).regex(POSTSCRIPT_NAME_PATTERN, {
    message: 'postScriptName must match [A-Za-z0-9._+-]+',
  }),
  familyName: z.string().min(1),
  subsetRanges: z.array(unicodeRangeSchema).optional(),
});

const imageAssetSchema = z.object({
  ...assetBaseFields,
  kind: z.literal('image'),
});

const videoAssetSchema = z.object({
  ...assetBaseFields,
  kind: z.literal('video'),
});

const audioAssetSchema = z.object({
  ...assetBaseFields,
  kind: z.literal('audio'),
});

const dataAssetSchema = z.object({
  ...assetBaseFields,
  kind: z.literal('data'),
});

export const assetSchema = z.discriminatedUnion('kind', [
  fontAssetSchema,
  imageAssetSchema,
  videoAssetSchema,
  audioAssetSchema,
  dataAssetSchema,
]);

// ────────────────────────────────────────────────────────────────────────────
// Factories
// ────────────────────────────────────────────────────────────────────────────

export interface FontAssetInput {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly source: AssetSource;
  readonly format: FontFormat;
  readonly postScriptName: string;
  readonly familyName: string;
  readonly subsetRanges?: readonly UnicodeRange[] | undefined;
  readonly fileSizeBytes?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export function fontAsset(input: FontAssetInput): FontAsset {
  return {
    id: input.id,
    kind: 'font',
    name: input.name,
    mimeType: input.mimeType,
    source: input.source,
    format: input.format,
    postScriptName: input.postScriptName,
    familyName: input.familyName,
    ...(input.subsetRanges === undefined ? {} : { subsetRanges: input.subsetRanges }),
    ...(input.fileSizeBytes === undefined ? {} : { fileSizeBytes: input.fileSizeBytes }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

export interface ImageAssetInput {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly source: AssetSource;
  readonly fileSizeBytes?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export function imageAsset(input: ImageAssetInput): ImageAsset {
  return {
    id: input.id,
    kind: 'image',
    name: input.name,
    mimeType: input.mimeType,
    source: input.source,
    ...(input.fileSizeBytes === undefined ? {} : { fileSizeBytes: input.fileSizeBytes }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Type guards
// ────────────────────────────────────────────────────────────────────────────

export function isFontAsset(asset: Asset): asset is FontAsset {
  return asset.kind === 'font';
}

export function isImageAsset(asset: Asset): asset is ImageAsset {
  return asset.kind === 'image';
}

export function isVideoAsset(asset: Asset): asset is VideoAsset {
  return asset.kind === 'video';
}

export function isAudioAsset(asset: Asset): asset is AudioAsset {
  return asset.kind === 'audio';
}

export function isDataAsset(asset: Asset): asset is DataAsset {
  return asset.kind === 'data';
}
