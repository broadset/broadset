export { hydrateDocumentFromFastPath } from './fast-path';
export { type ExtractedTextItem, extractTextItems } from './operators';
export {
  collectEmbeddedFileNames,
  collectMarkedContentTags,
  hasEmbeddedJavaScript,
  loadPdf,
  type PdfLoadResult,
  probeLoadPdf,
  readDocumentXmp,
  readRoundTripMetadata,
} from './parse';
export { extractThirdPartyElements } from './third-party';
export { type PdfAValidationResult, validatePdfA2b, validatePdfAXmpPacket } from './validate-pdfa';
