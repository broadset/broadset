import { z } from 'zod';

import type { FontWeight } from './style';

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

export type AssetKind = 'image' | 'video' | 'font' | 'audio' | 'data' | 'icc-profile';

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
  /**
   * OpenType weight axis (100..900). Defaults to 400 (Regular) when
   * omitted. Drives the `<p:bold>` vs `<p:regular>` slot selection on
   * PPTX export and the `font-weight` descriptor on SVG `@font-face`.
   */
  readonly weight?: FontWeight | undefined;
  /**
   * `true` for italic / oblique faces. Defaults to `false` when
   * omitted. Drives the `<p:italic>` / `<p:boldItalic>` slot
   * selection on PPTX export and the `font-style` descriptor on SVG
   * `@font-face`.
   */
  readonly italic?: boolean | undefined;
  /** Declared Unicode coverage — required by the subsetting pipeline (P4.5). */
  readonly subsetRanges?: readonly UnicodeRange[] | undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Other asset variants (tightened in later Phase 4 units)
// ────────────────────────────────────────────────────────────────────────────

export interface ImageAsset extends AssetBase {
  readonly kind: 'image';
  /**
   * Intrinsic pixel width. Required so exporters (SVG `<image>`, PDF
   * image XObject, PPTX picture frame) can emit coordinates without
   * decoding the byte blob.
   */
  readonly width: number;
  /** Intrinsic pixel height. See `width` for rationale. */
  readonly height: number;
  /**
   * Optional reference to an `icc-profile` asset (lands in P4.4).
   * Consumed by PDF prepress (`/OutputIntent` per-image override),
   * PSD CMYK / Lab channel pipelines, and JPEG / PNG pass-through.
   * Named to match `document.outputIntent.iccProfileAssetId` so every
   * ICC reference in the model shares a single grep handle.
   */
  readonly iccProfileAssetId?: string | undefined;
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

// ────────────────────────────────────────────────────────────────────────────
// ICC profile asset (Phase 4 P4.4)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Color spaces an ICC profile can describe for graphic-arts workflows.
 * Mirrors `DocumentOutputIntent.colorSpace` so a single grep finds
 * every ICC mode in the model.
 */
export type IccProfileColorSpace = 'rgb' | 'cmyk' | 'gray' | 'lab';

export interface IccProfileAsset extends AssetBase {
  readonly kind: 'icc-profile';
  readonly colorSpace: IccProfileColorSpace;
  /** Human-readable profile description (ICC `desc` tag). */
  readonly description?: string | undefined;
  /** ICC profile identifier (MD5 fingerprint per ICC v4 spec) — used for dedup and PDF `/Info`. */
  readonly identifier?: string | undefined;
}

export type Asset = FontAsset | ImageAsset | VideoAsset | AudioAsset | DataAsset | IccProfileAsset;

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

/**
 * OpenType weight axis values. Mirrors {@link FontWeight} re-exported
 * from `style.ts` so the asset schema and the element style schema
 * agree on the same nine canonical steps (no hundreds-between
 * interpolation, since OOXML / PDF font tables only resolve at the
 * canonical steps anyway).
 */
const fontWeightSchema = z.union([
  z.literal(100),
  z.literal(200),
  z.literal(300),
  z.literal(400),
  z.literal(500),
  z.literal(600),
  z.literal(700),
  z.literal(800),
  z.literal(900),
]);

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
  weight: fontWeightSchema.optional(),
  italic: z.boolean().optional(),
  subsetRanges: z.array(unicodeRangeSchema).optional(),
});

const pixelDimensionSchema = z.number().int().positive();

const imageAssetSchema = z.object({
  ...assetBaseFields,
  kind: z.literal('image'),
  width: pixelDimensionSchema,
  height: pixelDimensionSchema,
  iccProfileAssetId: z.string().min(1).optional(),
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

const iccProfileColorSpaceSchema = z.enum(['rgb', 'cmyk', 'gray', 'lab']);

const iccProfileAssetSchema = z.object({
  ...assetBaseFields,
  kind: z.literal('icc-profile'),
  colorSpace: iccProfileColorSpaceSchema,
  description: z.string().min(1).optional(),
  identifier: z.string().min(1).optional(),
});

export const assetSchema = z.discriminatedUnion('kind', [
  fontAssetSchema,
  imageAssetSchema,
  videoAssetSchema,
  audioAssetSchema,
  dataAssetSchema,
  iccProfileAssetSchema,
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
  readonly weight?: FontWeight | undefined;
  readonly italic?: boolean | undefined;
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
    ...(input.weight === undefined ? {} : { weight: input.weight }),
    ...(input.italic === undefined ? {} : { italic: input.italic }),
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
  readonly width: number;
  readonly height: number;
  readonly iccProfileAssetId?: string | undefined;
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
    width: input.width,
    height: input.height,
    ...(input.iccProfileAssetId === undefined ? {} : { iccProfileAssetId: input.iccProfileAssetId }),
    ...(input.fileSizeBytes === undefined ? {} : { fileSizeBytes: input.fileSizeBytes }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

export interface IccProfileAssetInput {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly source: AssetSource;
  readonly colorSpace: IccProfileColorSpace;
  readonly description?: string | undefined;
  readonly identifier?: string | undefined;
  readonly fileSizeBytes?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export function iccProfileAsset(input: IccProfileAssetInput): IccProfileAsset {
  return {
    id: input.id,
    kind: 'icc-profile',
    name: input.name,
    mimeType: input.mimeType,
    source: input.source,
    colorSpace: input.colorSpace,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.identifier === undefined ? {} : { identifier: input.identifier }),
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

export function isIccProfileAsset(asset: Asset): asset is IccProfileAsset {
  return asset.kind === 'icc-profile';
}
