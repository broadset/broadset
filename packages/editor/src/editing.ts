export {
  deleteClipPathPoint,
  insertClipPathPoint,
  parsePolygonPoints,
  startClipPathEditing,
  stopClipPathEditing,
  updateClipPathPoint,
} from './editing/clip-path';
export {
  appendPathPoint,
  beginPlacement,
  cancelPlacement,
  closeAndStopPathDrawing,
  commitAndStopPathDrawing,
  commitEllipseRotation,
  commitPlacementExtent,
  setEllipseRadius,
  setPlacementAnchor,
  startMotionPathEditing,
  startPathDrawing,
  startPathEditing,
  stopMotionPathEditing,
  stopPathDrawing,
  stopPathEditing,
  updatePlacementPreview,
  validateEditorConfig,
} from './editing/commands';
export type {
  PlacementBounds,
  PlacementPoint as PlacementBoundsPoint,
  PlacementMode as PlacementResolutionMode,
} from './editing/placement-bounds';
export {
  isSamePlacementPoint,
  resolveCornerBounds,
  resolveEllipseBounds,
  resolvePlacementMode,
  resolvePluginSingleClickBounds,
} from './editing/placement-bounds';
export type { PreflightConfig, PreflightDiagnostic, PreflightRule, PreflightSeverity } from './editing/preflight';
export { runPreflightDiagnostics } from './editing/preflight';
export type { ElementDefaults, PluginDefaults } from './element-defaults';
export { getElementDefaults } from './element-defaults';
