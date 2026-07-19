import type { PptxSourceColor, PptxThemeSlot } from './project-model';

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
  readonly maxExpansionRatio?: number;
  readonly maxDepth?: number;
  readonly authoredSurface?: {
    readonly unit: 'px' | 'mm' | 'in';
    readonly dpi: number;
  };
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
  readonly color?: PptxSourceColor;
}

export interface ResolvedTheme {
  readonly palette: Readonly<Record<PptxThemeSlot, string>>;
}

export const BROADSET_ELEMENT_EXT_URI = '{broadset-element-ext}';
