export { parseCssColor } from './color';
export { exportPdfBytes, exportPdfWithPreflight } from './core';
export { decodeDataUri } from './data-uri';
export { normalizeFontFamily, resolveGoogleFontUrl } from './fonts';
export { canvasToPoints } from './geometry';
export { canRoundTrip, importPdfDocument, readPdfRoundTripMetadata } from './import';
export { validatePdfA2b, validatePdfAXmpPacket } from './import/validate-pdfa';
export { buildMaskedSvgSource } from './masked-svg';
export { drawQrOnPage } from './qr';
export { readPreservedPdfDocument, reconcilePdf } from './roundtrip';
export { exportPdfBytesV1, exportPdfWithPreflightV1, importPdfProjectV1, type PdfExportInputV1 } from './v1';
// `wrapText` and `reorderForBidi` are internal — see `./text.ts`.
// They depend transitively on `bidi-js` / `linebreak` (no upstream
// types), so exposing them through the public surface would leak
// untyped-module errors into downstream packages' tsc walks.
export type { PdfExportOptions, PdfExportResult, PdfImportOptions } from './types';
