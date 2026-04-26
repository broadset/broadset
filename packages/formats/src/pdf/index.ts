export { parseCssColor } from './color';
export { exportPdfBytes, exportPdfWithPreflight } from './core';
export { decodeDataUri } from './data-uri';
export { normalizeFontFamily, resolveGoogleFontUrl } from './fonts';
export { canvasToPoints } from './geometry';
export { canRoundTrip, importPdfDocument, readPdfRoundTripMetadata } from './import';
export { type PdfAValidationResult, validatePdfA2b, validatePdfAXmpPacket } from './import/validate-pdfa';
export { buildMaskedSvgSource } from './masked-svg';
export { drawQrOnPage } from './qr';
export { dirtyElementIds, type PdfReconcileInput, reconcilePdf } from './roundtrip';
export { wrapText } from './text';
export type {
  BroadsetXmpPacket,
  ColorSpaceChoice,
  MarkedContentKind,
  MarkedContentTag,
  PdfAConformance,
  PdfExportOptions,
  PdfExportResult,
  PdfImportOptions,
  PdfRoundTripMetadata,
} from './types';
