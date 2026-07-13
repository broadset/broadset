import type { BroadsetColor, ThemeSlot } from '@broadset/model';

/** OOXML relationship ID, always shaped as `rId{n}`. */
export type OoxmlRelId = `rId${number}`;

export interface OoxmlRelationship {
  readonly id: OoxmlRelId;
  readonly type: string;
  readonly target: string;
  readonly external?: boolean;
}

export interface PptxImportOptions {
  readonly maxInputBytes?: number;
  readonly maxPartBytes?: number;
  readonly maxEntries?: number;
  readonly maxTotalUncompressedBytes?: number;
  readonly maxDepth?: number;
}

type PptxImportWarningCode =
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
  readonly detail?: string;
}

export interface ShapeNameTag {
  readonly id: string;
  readonly kind: string;
  readonly dataField?: string;
}

export interface ElementMetaExtension {
  readonly id: string;
  readonly kind: string;
  readonly dirty: boolean;
  readonly dataField?: string;
  readonly visibleWhen?: string;
  readonly repeater?: string;
  readonly animations?: readonly string[];
  readonly originalKind?: string;
  readonly preservedBlob?: string;
}

export interface LayoutPlaceholder {
  readonly index: number;
  readonly type?: string;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly color?: BroadsetColor;
}

export interface ResolvedTheme {
  readonly palette: Readonly<Record<ThemeSlot, string>>;
}

export interface PptxLedgerEntry {
  readonly elementId: string;
  readonly fingerprint: string;
}

export interface PptxRoundTripLedger {
  readonly documentId: string;
  readonly version: string;
  readonly exportedAt: string;
  readonly entries: readonly PptxLedgerEntry[];
}

export const BROADSET_ELEMENT_EXT_URI = '{broadset-element-ext}';
export const BROADSET_CUSTOM_XML_PROJECT = 'customXml/broadset-project.xml';
export const BROADSET_CUSTOM_XML_INTEROP = 'customXml/broadset-interop.xml';
