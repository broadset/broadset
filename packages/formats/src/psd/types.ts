import {
  type BroadsetFormatExtensions,
  broadsetFormatExtensionsBaseSchema,
  registerExtensionsSchema,
} from '@broadset/model';
import { z } from 'zod';

import { type BroadsetXmpPacket } from '../_shared/xmp';

/**
 * Phase 5 P5.1 — PSD-specific types + Zod registration.
 *
 * The PSD format track carries Broadset-native state in two places
 * (see `project/spec/formats/psd.md` → "Sources of truth at export
 * time"):
 *
 * 1. Document XMP under the shared `broadset:` namespace (IO-D-08).
 * 2. Per-layer additionalInfo under the `BsPs` 4-byte signature
 *    containing the element id, dirty flag, and any preservation
 *    blobs the importer recognized but cannot represent natively.
 *
 * This module defines the typed surface every Phase 2+ PSD module
 * consumes, and registers the `extensions.psd` Zod schema into the
 * central extensions registry per IO-D-11 so a stale `.bsp` fails
 * loudly on load.
 */

// ────────────────────────────────────────────────────────────────────────────
// Re-exports from shared modules
// ────────────────────────────────────────────────────────────────────────────

export type { BroadsetXmpPacket };

// ────────────────────────────────────────────────────────────────────────────
// Color space choice
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-document PSD color mode. Matches the allowed values of
 * `DocumentOutputIntent.colorSpace` so a PSD export can honor the
 * document-level choice without translating names.
 */
export type ColorSpaceChoice = 'rgb' | 'cmyk' | 'lab' | 'grayscale';

export const colorSpaceChoiceSchema = z.enum(['rgb', 'cmyk', 'lab', 'grayscale']);

// ────────────────────────────────────────────────────────────────────────────
// Round-trip metadata
// ────────────────────────────────────────────────────────────────────────────

/**
 * The tag stored in each layer's `additionalInfo` under the `BsPs`
 * 4-byte signature. Always carries the element id; the other fields
 * are optional because most elements don't need a preservation blob.
 */
export interface PsdRoundTripMetadata {
  readonly signature: 'BsPs';
  readonly elementId: string;
}

export const psdRoundTripMetadataSchema: z.ZodType<PsdRoundTripMetadata> = z.object({
  signature: z.literal('BsPs'),
  elementId: z.string().min(1),
});

/**
 * Opaque preservation blob for any PSD feature the importer recognized
 * but cannot represent natively (adjustment layer parameters, unknown
 * effects, exotic layer types, bitmap layer masks that can't map to
 * Broadset mask elements). Stored base64-encoded so the `.bsp` JSON
 * remains text-safe; exporters emit the bytes back verbatim when
 * `extensions.psd.dirty === false`.
 */
export interface PsdPreservedData {
  readonly mime: string;
  /** Base64-encoded bytes. */
  readonly raw: string;
}

export const psdPreservedDataSchema: z.ZodType<PsdPreservedData> = z.object({
  mime: z.string().min(1),
  raw: z.string().min(1),
});

export interface PsdUnmappedEffect {
  readonly kind: string;
  /** Base64-encoded raw effect parameter bytes. */
  readonly raw: string;
}

const psdUnmappedEffectSchema: z.ZodType<PsdUnmappedEffect> = z.object({
  kind: z.string().min(1),
  raw: z.string().min(1),
});

export interface PsdBitmapMask {
  readonly width: number;
  readonly height: number;
  /** Base64-encoded alpha channel bytes. */
  readonly raw: string;
}

const psdBitmapMaskSchema: z.ZodType<PsdBitmapMask> = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  raw: z.string().min(1),
});

// ────────────────────────────────────────────────────────────────────────────
// Extensions payload
// ────────────────────────────────────────────────────────────────────────────

/**
 * Linked smart object metadata — preserves the external file path and
 * stable GUID identity across round-trips so Photoshop's
 * "Update linked file" continues to resolve the referenced asset.
 */
export interface PsdSmartObjectLink {
  /** PSD linked-file GUID (UUID). Stable across re-exports. */
  readonly guid: string;
  /** MIME type of the linked asset. */
  readonly mime: string;
  /** Optional display name (falls back to element.name). */
  readonly name?: string | undefined;
}

export const psdSmartObjectLinkSchema: z.ZodType<PsdSmartObjectLink> = z.object({
  guid: z.string().min(1),
  mime: z.string().min(1),
  name: z.string().min(1).optional(),
});

export interface PsdExtensions extends BroadsetFormatExtensions {
  readonly roundTrip?: PsdRoundTripMetadata | undefined;
  readonly unmappedEffects?: PsdUnmappedEffect | undefined;
  readonly bitmapMask?: PsdBitmapMask | undefined;
  readonly preserved?: PsdPreservedData | undefined;
  readonly smartObject?: PsdSmartObjectLink | undefined;
}

export const psdExtensionsSchema: z.ZodType<PsdExtensions> = broadsetFormatExtensionsBaseSchema.extend({
  roundTrip: psdRoundTripMetadataSchema.optional(),
  unmappedEffects: psdUnmappedEffectSchema.optional(),
  bitmapMask: psdBitmapMaskSchema.optional(),
  preserved: psdPreservedDataSchema.optional(),
  smartObject: psdSmartObjectLinkSchema.optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Import / export options
// ────────────────────────────────────────────────────────────────────────────

/**
 * Optional per-import overrides. Empty object is valid — every field
 * has a sensible default derived from IO-D-18 (no silent drops) and
 * the shared importer security contract.
 */
export interface PsdImportOptions {
  /** Override the default element-tree depth cap from the shared importer security contract. */
  readonly maxDepth?: number | undefined;
  /** Override the default total-bytes cap. */
  readonly maxBytes?: number | undefined;
  /** When true, surface a warning for every feature mapped to `PsdPreservedData` rather than silently preserving. */
  readonly warnOnPreservation?: boolean | undefined;
}

export interface PsdExportOptions {
  /** Target color space. Defaults to `document.outputIntent.colorSpace` when set, else 'rgb'. */
  readonly colorSpace?: ColorSpaceChoice | undefined;
  /** 8 or 16. Defaults to 8. */
  readonly bitDepth?: 8 | 16 | undefined;
  /** When true, embed the referenced ICC profile asset bytes into the output. Defaults to true when `document.outputIntent.iccProfileAssetId` is set. */
  readonly embedIccProfile?: boolean | undefined;
  /** When false, linked smart objects are converted to embedded smart objects. Defaults to true. */
  readonly linkSmartObjects?: boolean | undefined;
  /** When false, element `visibility` is flattened (invisible elements are omitted). Defaults to true. */
  readonly preserveVisibility?: boolean | undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Registration (side effect — runs once at module load per IO-D-11)
// ────────────────────────────────────────────────────────────────────────────

registerExtensionsSchema('psd', psdExtensionsSchema);
