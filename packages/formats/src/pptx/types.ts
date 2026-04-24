/**
 * PPTX-specific types. These live in the PPTX module because they model
 * OOXML concepts (relationships, rel IDs, shape tags, interop ledgers,
 * placeholder inheritance). Cross-format types (BroadsetColor, TextBody,
 * Canvas, etc.) come from `@broadset/model`.
 */
import type { BroadsetColor, ThemeSlot } from '@broadset/model';

/** OOXML relationship ID — always of shape `rId{n}` where n ≥ 1. */
export type OoxmlRelId = `rId${number}`;

/** A single OOXML relationship entry inside an `_rels` file. */
export interface OoxmlRelationship {
  readonly id: OoxmlRelId;
  readonly type: string;
  readonly target: string;
  /** Optional `TargetMode="External"` for externally-referenced parts. */
  readonly external?: boolean;
}

/** Options accepted by the PPTX exporter. */
export interface PptxExportOptions {
  /**
   * When `true` (default), attach Broadset metadata layers: XMP packet in
   * `docProps/custom.xml`, custom XML parts under `customXml/`, and
   * per-shape `<p:cNvPr name="BSET:…">` tags plus `<p:extLst>` entries.
   */
  readonly preserveBroadsetMetadata?: boolean;
  /**
   * When `true` (default), include the interop ledger (per-element content
   * hashes). Disabled only for tests that want byte-stable output without
   * hash churn.
   */
  readonly includeInteropLedger?: boolean;
  /**
   * Hook to supply a fixed export timestamp (UNIX ms) so deterministic
   * tests can round-trip without needing to re-stub `Date.now`.
   */
  readonly exportedAt?: number;
}

/** Options accepted by the PPTX importer. */
export interface PptxImportOptions {
  /** Total input size cap in bytes (default: 200 MiB). */
  readonly maxInputBytes?: number;
  /** Per-part size cap in bytes (default: 50 MiB). */
  readonly maxPartBytes?: number;
  /** Archive entry-count cap (default: 4096). */
  readonly maxEntries?: number;
  /** XML parser recursion / element-tree depth cap (default: 100). */
  readonly maxDepth?: number;
}

/** Reason an importer emitted a warning. */
export type PptxImportWarningCode =
  | 'unsupported-shape'
  | 'unsupported-animation'
  | 'unsupported-content'
  | 'macro-rejected'
  | 'ole-rejected'
  | 'size-cap'
  | 'depth-cap'
  | 'entry-cap'
  | 'cycle-detected'
  | 'malformed-xml'
  | 'missing-relationship'
  | 'placeholder-resolution';

export interface PptxImportWarning {
  readonly code: PptxImportWarningCode;
  readonly message: string;
  /** Optional pointer to the part or element that triggered the warning. */
  readonly detail?: string;
}

/** Shape-name tag encoded into `<p:cNvPr name="BSET:…"/>`. */
export interface ShapeNameTag {
  readonly id: string;
  readonly kind: string;
  readonly dataField?: string;
}

/**
 * Structured metadata carried in the per-shape `<p:extLst>` entry under
 * the broadset element-ext URI. Mirrors the Broadset fields that don't
 * fit in the shape name, plus the dirty flag.
 */
export interface ElementMetaExtension {
  readonly id: string;
  readonly kind: string;
  readonly dirty: boolean;
  readonly dataField?: string;
  readonly visibleWhen?: string;
  readonly repeater?: string;
  readonly animations?: readonly string[];
  readonly originalKind?: string;
  /** Opaque original OOXML blob for preservation-only constructs. */
  readonly preservedBlob?: string;
}

/** A resolved OOXML theme palette (sRGB hex + family names). */
export interface SlideMasterResolved {
  readonly theme: ResolvedTheme;
  readonly majorFont: string;
  readonly minorFont: string;
}

/** Slide-layout resolution: placeholder values inherited down the chain. */
export interface SlideLayoutResolved {
  readonly master: SlideMasterResolved;
  /** Placeholder index → default text + properties for inheritance. */
  readonly placeholders: ReadonlyMap<number, LayoutPlaceholder>;
}

export interface LayoutPlaceholder {
  readonly index: number;
  readonly type?: string;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly color?: BroadsetColor;
}

/** Resolved theme palette keyed by OOXML slot name. */
export interface ResolvedTheme {
  readonly palette: Readonly<Record<ThemeSlot, string>>;
}

/**
 * A reference to a colour inside a theme slot, with optional OOXML
 * modifiers (`lumMod`, `lumOff`, `tint`, `shade`, `alpha`) applied via
 * `_shared/color/applyMods()` once the palette is known.
 */
export interface ThemeColorRef {
  readonly slot: ThemeSlot;
  readonly lumMod?: number;
  readonly lumOff?: number;
  readonly tint?: number;
  readonly shade?: number;
  readonly alpha?: number;
}

/** Interop ledger entry — stored in `customXml/broadset-interop.xml`. */
export interface PptxLedgerEntry {
  readonly elementId: string;
  readonly fingerprint: string;
}

/**
 * Full ledger attached to a PPTX export. Used by the importer fast-path
 * to determine per-element `dirty` state.
 */
export interface PptxRoundTripLedger {
  readonly documentId: string;
  readonly version: string;
  readonly exportedAt: string;
  readonly entries: readonly PptxLedgerEntry[];
}

/** Namespace URIs stable under ECMA-376 — exposed for import / export parity. */
export const BROADSET_ELEMENT_EXT_URI = '{broadset-element-ext}';
export const BROADSET_NAMESPACE_URI = 'https://broadset.io/ns/xmp/1.0/';
export const BROADSET_CUSTOM_XML_PROJECT = 'customXml/broadset-project.xml';
export const BROADSET_CUSTOM_XML_INTEROP = 'customXml/broadset-interop.xml';
