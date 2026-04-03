// ---------------------------------------------------------------------------
// @broadset/model — public API
// ---------------------------------------------------------------------------

// Animation
export type {
  AnimationRegistryEntry,
  ChildTimelineBinding,
  ElementAnimationConfig,
  Keyframe,
  KeyframeProperty,
  ModifierTimelineBinding,
  StateTimelineBinding,
  Timeline,
} from './animation';
export {
  animationRegistrySchema,
  createDefaultAnimationConfig,
  elementAnimationConfigSchema,
  isValidInterpolationMode,
  keyframeSchema,
  timelineSchema,
  validateCubicBezier,
} from './animation';

// Capabilities
export type { CapabilityProfile } from './capabilities';
export { CAPABILITY_FLAG_KEYS, getCapabilityProfile } from './capabilities';

// Changes
export type {
  AnimationUpdateChange,
  ChangeType,
  DocumentChange,
  ElementAddChange,
  ElementRemoveChange,
  ElementReorderChange,
  ElementUpdateChange,
  PageAddChange,
  PageRemoveChange,
  SettingsUpdateChange,
} from './changes';
export { CHANGE_TYPES, changeSchema } from './changes';

// Color
export { normalizeColor } from './color';

// Config
export type { CanvasSettings, EditorConfig, EditorFeatureConfig, GridSettings, Guide } from './config';
export {
  createDefaultCanvasSettings,
  createDefaultFeatureConfig,
  createDefaultGridSettings,
  editorConfigSchema,
  FALLBACK_SYSTEM_FONTS,
  featureConfigSchema,
  resolveFonts,
} from './config';

// Document
export type { BroadsetDocument, Canvas, Page, PageElement } from './document';
export { broadsetDocumentSchema, createEmptyBroadsetDocument } from './document';

// Element
export type { BroadsetElement, BuiltInElementType, ElementOverrides, ElementPosition } from './element';
export {
  BUILT_IN_ELEMENT_TYPES,
  createDefaultElement,
  elementSchema,
  isValidSvgPathData,
  sanitizeTextContent,
} from './element';

// Format reference
export type { CanvasSizePreset, FullBroadsetDocument } from './format-reference';
export { COMMON_CANVAS_SIZES, fullDocumentSchema } from './format-reference';

// Page validation
export { hasAcyclicParentIds, hasUniqueElementIds, hasValidParentIds } from './page-validation';

// Screen
export type { AnchorX, AnchorY, BroadsetScreenProps, MaskType, Visibility } from './screen';
export { createDefaultScreenProps, isValidCustomClipPath, screenPropsSchema } from './screen';

// Style
export type { BorderRadiusTuple, BroadsetElementStyle, FillRule, StrokeLinecap, StrokeLinejoin } from './style';
export { createDefaultStyle, isBorderRadiusUniform, normalizeBorderRadius, styleSchema } from './style';

// Utilities
export {
  computeEdgeAnchors,
  deepClone,
  generateDefaultClipPath,
  mmToPx,
  parseClipPathData,
  pxToMm,
  scalePathData,
  serializeClipPath,
} from './utilities';
