import {
  type BroadsetFormatExtensions,
  broadsetFormatExtensionsBaseSchema,
  registerExtensionsSchema,
} from '@broadset/model';
import { z } from 'zod';

import { BROADSET_XMP_NAMESPACE, type BroadsetXmpPacket } from '../_shared/xmp';

/**
 * Phase 7 P7.1 — SVG-specific types + Zod registration.
 *
 * The SVG format track carries Broadset-native state in three places
 * (see `project/spec/formats/svg.md` → "Sources of truth at export
 * time"):
 *
 * 1. A document `<metadata>` RDF/XML packet under the shared
 *    `broadset:` namespace (IO-D-08). Same URI as PSD `XMPMetadata`,
 *    PDF `Metadata` dict, and PPTX `docProps/custom.xml`.
 * 2. Per-element `data-bs-*` attributes (SVG 2 / HTML5 global) plus a
 *    namespaced `broadset:content-hash` for identity recovery after
 *    aggressive external edits strip `data-*`.
 * 3. Opaque preservation blobs for constructs the importer recognised
 *    but cannot represent natively (`<foreignObject>` with non-active
 *    content, unknown vendor elements) — stored base64-encoded so the
 *    `.bsp` JSON remains text-safe and the exporter can re-emit bytes
 *    verbatim when `extensions.svg.dirty === false`.
 *
 * This module defines the typed surface every Phase 7.2+ SVG module
 * consumes, and registers the `extensions.svg` Zod schema into the
 * central registry per IO-D-11 so a stale `.bsp` fails loudly on load.
 */

// ────────────────────────────────────────────────────────────────────────────
// Re-exports from shared modules
// ────────────────────────────────────────────────────────────────────────────

export type { BroadsetXmpPacket };

/**
 * The namespace URI declared on the root `<svg>` element and on every
 * `broadset:`-prefixed attribute. Unified with `BROADSET_XMP_NAMESPACE`
 * so PSD / PDF / PPTX / SVG reconciliation treats a single namespace
 * URI as the canonical Broadset identity carrier.
 */
export const SVG_BROADSET_NAMESPACE = BROADSET_XMP_NAMESPACE;

// ────────────────────────────────────────────────────────────────────────────
// Enumerations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Export-time font-embedding choice. `'embed'` (default) bakes WOFF2
 * bytes as base64 inside `<defs><style>@font-face { src: url(...); }</style>`.
 * `'reference'` emits an external `url()`. `'flatten'` converts text
 * elements to `<path>` glyph outlines.
 */
export type FontEmbedChoice = 'embed' | 'reference' | 'flatten';

export const fontEmbedChoiceSchema = z.enum(['embed', 'reference', 'flatten']);

/**
 * Length units recognised by SVG 2 that Broadset honours on import. The
 * exporter always emits `px` values because `canvas.unit` is coerced to
 * user-space coordinates at model boundaries. Import normalises each to
 * `px` using the document's `canvas.dpi`.
 */
export type UnitSystem = 'px' | 'mm' | 'in' | 'pt' | 'em';

export const unitSystemSchema = z.enum(['px', 'mm', 'in', 'pt', 'em']);

/**
 * The canonical Broadset element kinds the per-element tag advertises.
 * Matches the 11 types the model supports (see AGENTS.md). Kept as a
 * local enum rather than importing the model's union so this schema
 * stays decoupled from the concrete element-union shape.
 */
const elementKindSchema = z.enum([
  'text',
  'image',
  'svg',
  'path',
  'rectangle',
  'ellipse',
  'qrcode',
  'group',
  'video',
  'clock',
  'ticker',
]);

// ────────────────────────────────────────────────────────────────────────────
// Round-trip metadata
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-element round-trip tag. Always carries the element id and its
 * content-hash fingerprint; optionally carries a preservation blob for
 * opaque fragments the importer could not represent natively.
 */
export interface SvgRoundTripMetadata {
  readonly elementId: string;
  readonly fingerprint: string;
  readonly preserved?: SvgPreservedData | undefined;
}

/**
 * Opaque preservation blob for any SVG fragment the importer
 * recognised but cannot represent natively (`<foreignObject>`,
 * unknown vendor elements, structurally complex nested SVG). Stored
 * base64-encoded so the `.bsp` JSON stays text-safe; exporters emit
 * the bytes back verbatim when `extensions.svg.dirty === false`.
 */
export interface SvgPreservedData {
  readonly mime: string;
  /** Base64-encoded bytes. */
  readonly raw: string;
}

export const svgPreservedDataSchema: z.ZodType<SvgPreservedData> = z.object({
  mime: z.string().min(1),
  raw: z.string(),
});

export const svgRoundTripMetadataSchema: z.ZodType<SvgRoundTripMetadata> = z.object({
  elementId: z.string().min(1),
  fingerprint: z.string().min(1),
  preserved: svgPreservedDataSchema.optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Document-level RDF packet
// ────────────────────────────────────────────────────────────────────────────

/**
 * The full document packet carried inside the root `<svg><metadata>`
 * RDF/XML block. A superset of the shared `BroadsetXmpPacket` with
 * SVG-specific extensions (canvas unit/dpi, page override maps,
 * gradient definitions for conic fallback). The shared XMP surface is
 * the subset PSD / PDF / PPTX also consume.
 */
export interface BroadsetRdfPacket {
  readonly documentId: string;
  readonly version: string;
  readonly exportedAt: string;
  readonly canvas: {
    readonly unit: UnitSystem;
    readonly dpi: number;
  };
  readonly elements: readonly {
    readonly id: string;
    readonly fingerprint: string;
  }[];
}

export const broadsetRdfPacketSchema: z.ZodType<BroadsetRdfPacket> = z.object({
  documentId: z.string().min(1),
  version: z.string().min(1),
  exportedAt: z.string().min(1),
  canvas: z.object({
    unit: unitSystemSchema,
    dpi: z.number().positive(),
  }),
  elements: z.array(
    z.object({
      id: z.string().min(1),
      fingerprint: z.string().min(1),
    }),
  ),
});

// ────────────────────────────────────────────────────────────────────────────
// Per-element tag attributes
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-element SVG 2 / HTML5 `data-bs-*` attributes plus the
 * `broadset:content-hash` namespaced attribute, expressed in their
 * TypeScript-camelCased form. Encoders attach these to each rendered
 * element; decoders read them back when the fast-path importer runs.
 */
export interface ElementTagAttrs {
  readonly dataBsId: string;
  readonly dataBsKind:
    | 'text'
    | 'image'
    | 'svg'
    | 'path'
    | 'rectangle'
    | 'ellipse'
    | 'qrcode'
    | 'group'
    | 'video'
    | 'clock'
    | 'ticker';
  readonly contentHash: string;
  readonly dataBsDataField?: string | undefined;
  readonly dataBsVisibleWhen?: string | undefined;
  readonly dataBsRepeater?: string | undefined;
}

export const elementTagAttrsSchema: z.ZodType<ElementTagAttrs> = z.object({
  dataBsId: z.string().min(1),
  dataBsKind: elementKindSchema,
  contentHash: z.string().min(1),
  dataBsDataField: z.string().min(1).optional(),
  dataBsVisibleWhen: z.string().min(1).optional(),
  dataBsRepeater: z.string().min(1).optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Sanitization report
// ────────────────────────────────────────────────────────────────────────────

export type SvgSanitizationRemovalKind = 'element' | 'attribute' | 'url';

export interface SvgSanitizationRemoval {
  readonly kind: SvgSanitizationRemovalKind;
  readonly name: string;
}

/**
 * Structured output of the shared `_shared/sanitize/sanitizeSvg` path
 * plus the SVG-specific follow-depth / cycle-detection checks the
 * importer layers on top. Surfaced to the UI via the shared
 * `FormatImportWarningsModal`.
 */
export interface SvgSanitizationReport {
  readonly empty: boolean;
  readonly removed: readonly SvgSanitizationRemoval[];
}

export const svgSanitizationReportSchema: z.ZodType<SvgSanitizationReport> = z.object({
  empty: z.boolean(),
  removed: z.array(
    z.object({
      kind: z.enum(['element', 'attribute', 'url']),
      name: z.string().min(1),
    }),
  ),
});

// ────────────────────────────────────────────────────────────────────────────
// SvgExtensions — registered per IO-D-11
// ────────────────────────────────────────────────────────────────────────────

export interface SvgExtensions extends BroadsetFormatExtensions {
  readonly roundTrip?: SvgRoundTripMetadata | undefined;
  readonly preserved?: SvgPreservedData | undefined;
  readonly sanitizationReport?: SvgSanitizationReport | undefined;
}

export const svgExtensionsSchema: z.ZodType<SvgExtensions> = broadsetFormatExtensionsBaseSchema.extend({
  roundTrip: svgRoundTripMetadataSchema.optional(),
  preserved: svgPreservedDataSchema.optional(),
  sanitizationReport: svgSanitizationReportSchema.optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Import / export options
// ────────────────────────────────────────────────────────────────────────────

export interface SvgImportOptions {
  /** Override the default element-tree depth cap from the shared importer security contract. */
  readonly maxDepth?: number | undefined;
  /** Override the default total-bytes cap. */
  readonly maxBytes?: number | undefined;
  /** Surface a warning for every feature mapped to `SvgPreservedData`. */
  readonly warnOnPreservation?: boolean | undefined;
  /**
   * When true, `<foreignObject>` content is preserved as an opaque
   * `svg`-type Broadset element with sanitized `outerHTML`. When
   * false (default), `<foreignObject>` is stripped outright per the
   * importer security contract.
   */
  readonly allowForeignObject?: boolean | undefined;
  /**
   * Per-family font byte sources for import-side glyph flatten.
   * When a `<text>` element sits under a baking ancestor (scale /
   * skew / non-decomposable matrix) AND `fontSources` carries
   * bytes for the referenced `font-family`, the importer
   * pre-multiplies every glyph outline by the cumulative matrix
   * and emits a `path` element instead of dropping the scale to
   * translate-only. Same `SvgFontSource` shape the exporter uses
   * — pass the same map to both directions for round-trip
   * fidelity.
   */
  readonly fontSources?: ReadonlyMap<string, SvgFontSource> | undefined;
}

export const svgImportOptionsSchema: z.ZodType<SvgImportOptions> = z.object({
  maxDepth: z.number().positive().optional(),
  maxBytes: z.number().positive().optional(),
  warnOnPreservation: z.boolean().optional(),
  allowForeignObject: z.boolean().optional(),
  fontSources: z.custom<ReadonlyMap<string, SvgFontSource>>((v) => v instanceof Map).optional(),
});

/**
 * Per-family source declared by the caller for font embedding /
 * referencing / flattening. The exporter uses `bytes` for `'embed'`
 * (subsets and base64-encodes) and `'flatten'` (extracts glyph
 * outlines), and `url` for `'reference'`.
 *
 * `__testPermissionOverride` is a TEST-ONLY escape hatch (note the
 * `__` prefix) — production callers MUST NOT pass it. It exists so
 * permission-policy tests can deterministically exercise the
 * `restricted` branch without committing a restricted-fsType font
 * fixture. The Zod schema and the public `SvgExportOptions.fonts`
 * surface ignore the field at the consumer's expense if set.
 */
export interface SvgFontSource {
  readonly bytes?: Uint8Array | undefined;
  readonly url?: string | undefined;
  readonly format: 'woff2' | 'ttf' | 'otf';
  readonly __testPermissionOverride?: 'installable' | 'editable' | 'preview-print' | 'restricted' | undefined;
}

export interface SvgExportOptions {
  /** Font-embedding strategy. Default: `'embed'`. */
  readonly fontEmbedding?: FontEmbedChoice | undefined;
  /**
   * Per-family font sources keyed by `font-family`. The exporter
   * walks every text element, collects the codepoints used, and
   * subsets / references / flattens via this map. Families absent
   * from the map fall back to consumer-side font resolution and
   * surface a warning under `'embed'` mode.
   */
  readonly fonts?: ReadonlyMap<string, SvgFontSource> | undefined;
  /** When false, the document `<metadata>` packet is omitted. Default: `true`. */
  readonly includeMetadata?: boolean | undefined;
  /** When false, `data-bs-*` + `broadset:content-hash` tagging is omitted. Default: `true`. */
  readonly includeElementTagging?: boolean | undefined;
  /**
   * When true, `<g>` group transforms are composed into children
   * rather than emitted as a group-level `transform`. Useful for
   * consumers that reject nested transforms (strict SVG 1.1 readers).
   * Default: `false`.
   */
  readonly flattenGroups?: boolean | undefined;
}

export const svgExportOptionsSchema: z.ZodType<SvgExportOptions> = z.object({
  fontEmbedding: fontEmbedChoiceSchema.optional(),
  fonts: z.custom<ReadonlyMap<string, SvgFontSource>>((v) => v instanceof Map).optional(),
  includeMetadata: z.boolean().optional(),
  includeElementTagging: z.boolean().optional(),
  flattenGroups: z.boolean().optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Registration (side effect — runs once at module load per IO-D-11)
// ────────────────────────────────────────────────────────────────────────────

registerExtensionsSchema('svg', svgExtensionsSchema);
