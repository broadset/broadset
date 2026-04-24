import type { BroadsetXmpPacket as SharedBroadsetXmpPacket } from '../_shared/xmp';

/**
 * Colour space choice for a PDF export, matching IO-D-13 (colour mode is
 * per-document) and the spec's `document.outputIntent.colorSpace` field.
 *
 * - `rgb` — sRGB / DeviceRGB.
 * - `cmyk` — DeviceCMYK with an embedded ICC profile where declared.
 * - `spot` — DeviceN / Separation spot colours alongside a process base.
 */
export type ColorSpaceChoice = 'rgb' | 'cmyk' | 'spot';

/**
 * Options controlling the PDF export pipeline.
 *
 * All fields are optional — the exporter reads defaults from the document
 * model (colour space from `outputIntent`, fonts from asset registry) so
 * callers opt into an option only when they need to override the document
 * declaration.
 */
export interface PdfExportOptions {
  /** Fetch implementation for Google Fonts / image URL resolution. */
  readonly fetch?: typeof globalThis.fetch;
  /** Subset embedded fonts to the glyphs used in the document (default true per IO-D-09). */
  readonly subsetFonts?: boolean;
  /** Emit OCGs (Optional Content Groups), one per page (default true). */
  readonly emitOcgs?: boolean;
  /** Override the colour space declared on `document.outputIntent`. */
  readonly colorSpace?: ColorSpaceChoice;
}

/**
 * Options controlling the PDF import pipeline.
 */
export interface PdfImportOptions {
  /** Password for encrypted PDFs. Absent + encrypted input ⇒ import rejected with warning. */
  readonly password?: string;
  /** Fetch implementation for resolving external resources referenced by the PDF. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Broadset element kinds serialised into a `/BSET` marked-content tag's `/Kind` property.
 * Mirrors the `BroadsetElement['type']` discriminated-union values one-to-one.
 */
export type MarkedContentKind =
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

/**
 * Marked-content property dictionary value attached to every painted
 * element's `BDC` / `EMC` pair. The exporter registers this under the
 * page's `/Resources /Properties` dictionary using the element id as key,
 * and emits the `/BSET` name to reference it.
 */
export interface MarkedContentTag {
  /** Element id; round-trips as the `/ID` string literal. */
  readonly id: string;
  /** Element type; round-trips as a PDF `/Name` value. */
  readonly kind: MarkedContentKind;
  /** Dirty flag from `extensions.pdf.dirty`; default `false` on import. */
  readonly dirty: boolean;
  /** Optional data-binding field name round-tripped as `/DataField`. */
  readonly dataField?: string;
  /** Base-64 preservation blob for features PDF cannot natively express. */
  readonly preservationBlob?: string;
}

/**
 * Broadset XMP packet re-exported from `_shared/xmp/` so PDF consumers can
 * import the round-trip metadata shape without reaching into `_shared/`.
 * Per IO-D-08 the same packet is emitted by every round-trippable format.
 */
export type BroadsetXmpPacket = SharedBroadsetXmpPacket;

/**
 * Round-trip metadata produced by the import pipeline. Carried alongside the
 * hydrated document so the reconciliation pipeline (P6.5) can diff current
 * operator-level visual state against preserved XMP defaults.
 */
export interface PdfRoundTripMetadata {
  /** Document-level XMP packet, or `null` when the source PDF has none. */
  readonly xmp: BroadsetXmpPacket | null;
  /** All `/BSET` marked-content tags collected from every page. */
  readonly markedContentTags: readonly MarkedContentTag[];
}
