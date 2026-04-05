// ---------------------------------------------------------------------------
// @broadset/formats — public API
// ---------------------------------------------------------------------------

// Interchange
export type { OgrafPackage } from './interchange';
export {
  exportDocumentJson,
  exportVideoBlob,
  generateOgrafPackages,
  generateQrSvgFragment,
  importDocumentJson,
  isVideoExportSupported,
  sanitizeFilename,
} from './interchange';

// Raster export
export {
  CANVAS_DATA_MARKER,
  DEFAULT_JPEG_QUALITY,
  downloadEmbeddedSvg,
  downloadJpeg,
  downloadPng,
  exportEmbeddedSvgBlob,
  exportJpegBlob,
  exportPngBlob,
  findCanvasElement,
} from './raster';

// Web vector (SVG / HTML)
export type { ImportedElement, SvgImportResult } from './web-vector';
export { exportHtmlStandalone, exportSvg, importSvg } from './web-vector';

// PDF export
export type { FontFetcher, ParsedColor, PdfExportOptions } from './pdf';
export {
  buildMaskedSvgSource,
  decodeDataUri,
  exportPdf,
  normalizeFontFamily,
  parseColor,
  parseGoogleFontsCss,
  resolveFonts,
  wrapText,
} from './pdf';

// PPTX export/import
export type { ImportedPptxElement } from './pptx';
export { exportPptx, importPptx } from './pptx';

// PSD export/import
export type { ImportedPsdDocument, ImportedPsdElement, ImportedPsdPage } from './psd';
export { exportPsd, importPsd, svgPathToPsdVectorMask } from './psd';
