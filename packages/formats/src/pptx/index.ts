export { exportPptxBytes } from './export';
export { importPptx } from './import';

// P8.1 — typed infrastructure and shared OOXML helpers.
export type {
  ElementMetaExtension,
  OoxmlRelationship,
  OoxmlRelId,
  PptxExportOptions,
  PptxImportOptions,
  PptxImportWarning,
  PptxImportWarningCode,
  PptxLedgerEntry,
  PptxRoundTripLedger,
  ShapeNameTag,
} from './types';
