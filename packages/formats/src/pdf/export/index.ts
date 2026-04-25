export { resolveAnimatedElementInState } from './animations';
export { clipPathBrackets } from './clip';
export {
  colorToPdfRgb,
  resolveFillAsPdfRgb,
  resolveFillGradient,
  resolveGradientFallbackColor,
  resolveOpacity,
  resolveStyleColor,
} from './color';
export {
  elementFontIdentity,
  type FontIdentity,
  identityKey,
  lookupFont,
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
export { type OcgRegistration, registerPageOcgs } from './ocg';
export { applyPageBoxes, type PageBoxesResult } from './page-boxes';
export { applyBrackets, elementTopLeftPt } from './page-layout';
export { renderPath } from './path';
export { collectPreflightWarnings } from './preflight';
export { buildRoundedRectPath, type CornerRadii, hasAnyRoundedCorner, ROUNDED_RECT_KAPPA } from './rectangle';
export { renderText } from './text';
export { attachBroadsetXmp, buildBroadsetXmpPacket } from './xmp';
