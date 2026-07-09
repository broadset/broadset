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
export { resolveFonts } from './fonts';
export {
  type CanvasAbsolutePosition,
  composeCanvasAbsolutePosition,
  elementRotationBrackets,
  indexElementsById,
} from './geometry';
export { emitLinkAnnotation, readElementLink } from './hyperlinks';
export { drawImagePlaceholder, embedImageFromBytes, fetchImageBytes, rasterizeSvgToPngBytes } from './image';
export { buildMarkedContentTag, markedContentBrackets } from './marked-content';
export { attachOcgResourceBindings, type OcgRegistration, registerPageOcgs } from './ocg';
export { applyPageBoxes } from './page-boxes';
export { applyBrackets, elementTopLeftPt } from './page-layout';
export { renderPath } from './path';
export { attachOutputIntent, ensureTrailerId, pdfaConformanceLetter, resolveOutputIntent } from './pdfa';
export { collectPreflightWarnings } from './preflight';
export { buildRoundedRectPath, type CornerRadii, hasAnyRoundedCorner } from './rectangle';
export { registerLinearOrRadialShading, type ShadingGeometry } from './shading';
export { attachPdfaStructureTree } from './struct-tree';
export { renderText } from './text';
export { attachBroadsetXmp, buildBroadsetXmpPacket } from './xmp';
