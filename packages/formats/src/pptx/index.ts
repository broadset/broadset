export { exportPptxBytes, exportPptxBytesAsync } from './export';
export { importPptx } from './import';
export { readPreservedPptxDocument, reconcilePptx } from './reconcile';
export type { ValidationIssue, ValidationIssueLevel, ValidationResult } from './validate';
export { validatePptxPackage } from './validate';

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
