export { exportPptxBytes, exportPptxBytesAsync, exportPptxWithReport, exportPptxWithReportAsync } from './export';
export { defaultUrlFontResolver } from './export/fonts';
export { importPptx, importPptxWithMerge } from './import';
export { readPreservedPptxDocument, reconcilePptx } from './reconcile';
export { importPptxProjectV1, type PptxReconcileResultV1, reconcilePptxProjectV1 } from './v1';
// P8.1 — typed infrastructure and shared OOXML helpers.
export type {
  AsyncFontResolver,
  PptxExportReport,
  PptxExportWarning,
  PptxExportWarningCode,
  PptxImportOptions,
} from './types';
