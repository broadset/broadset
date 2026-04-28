export { parseCssColor } from './color';
export { exportPdfBytes, exportPdfWithPreflight } from './core';
export { decodeDataUri } from './data-uri';
export { normalizeFontFamily, resolveGoogleFontUrl } from './fonts';
export { canvasToPoints } from './geometry';
export { canRoundTrip, importPdfDocument, readPdfRoundTripMetadata } from './import';
export { type PdfAValidationResult, validatePdfA2b, validatePdfAXmpPacket } from './import/validate-pdfa';
export { buildMaskedSvgSource } from './masked-svg';
export { drawQrOnPage } from './qr';
export { dirtyElementIds, type PdfReconcileInput, readPreservedPdfDocument, reconcilePdf } from './roundtrip';
// `wrapText` and `reorderForBidi` are internal — see `./text.ts`.
// They depend transitively on `bidi-js` / `linebreak` (no upstream
// types), so exposing them through the public surface would leak
// untyped-module errors into downstream packages' tsc walks.
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
