export { resolveAnimatedElementInState } from './animations';
export { clipPathBrackets } from './clip';
export {
  colorToPdfRgb,
  resolveFillAsPdfRgb,
  resolveFillGradient,
  resolveGradientFallbackColor,
  resolveOpacity,
  resolveStyleColor,
  srgbToDeviceCmyk,
} from './color';
export {
  elementFontIdentity,
  type FontIdentity,
  identityKey,
  lookupFont,
  registerFontkit,
  resolveFonts,
  resolveIdentity,
  selectStandardFontVariant,
} from './fonts';
export {
  type CanvasAbsolutePosition,
  composeCanvasAbsolutePosition,
  elementRotationBrackets,
  indexElementsById,
  type OperatorBrackets,
} from './geometry';
export {
  drawImagePlaceholder,
  embedImageFromBytes,
  fetchImageBytes,
  rasterizeSvgToPngBytes,
} from './image';
export { buildMarkedContentTag, markedContentBrackets } from './marked-content';
export { attachOcgResourceBindings, type OcgRegistration, type OcgResourceBinding, registerPageOcgs } from './ocg';
export { applyPageBoxes, type PageBoxesResult } from './page-boxes';
export { applyBrackets, elementTopLeftPt } from './page-layout';
export { renderPath } from './path';
export {
  attachOutputIntent,
  ensureTrailerId,
  type PdfAConformance,
  pdfaConformanceLetter,
  type ResolvedOutputIntent,
  resolveOutputIntent,
} from './pdfa';
export { collectPreflightWarnings } from './preflight';
export { buildRoundedRectPath, type CornerRadii, hasAnyRoundedCorner, ROUNDED_RECT_KAPPA } from './rectangle';
export {
  type RegisteredShadingPattern,
  registerLinearOrRadialShading,
  type ShadingGeometry,
} from './shading';
export { attachPdfaStructureTree } from './struct-tree';
export { renderText } from './text';
export { attachBroadsetXmp, buildBroadsetXmpPacket } from './xmp';
