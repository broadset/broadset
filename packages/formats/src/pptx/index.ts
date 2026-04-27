export {
  exportPptxBytes,
  exportPptxBytesAsync,
  exportPptxWithReport,
  exportPptxWithReportAsync,
} from './export';
export type { PptxImportReport } from './import';
export { importPptx, importPptxWithMerge, importPptxWithReport } from './import';
export { readPreservedPptxDocument, reconcilePptx } from './reconcile';
export type { ValidationIssue, ValidationIssueLevel, ValidationResult } from './validate';
export { validatePptxPackage } from './validate';

// P8.1 — typed infrastructure and shared OOXML helpers.
export type {
  ElementMetaExtension,
  OoxmlRelationship,
  OoxmlRelId,
  PptxExportOptions,
  PptxExportReport,
  PptxExportWarning,
  PptxExportWarningCode,
  PptxImportOptions,
  PptxImportWarning,
  PptxImportWarningCode,
  PptxLedgerEntry,
  PptxRoundTripLedger,
  ShapeNameTag,
} from './types';
