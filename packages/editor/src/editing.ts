export {
  deleteClipPathPoint,
  insertClipPathPoint,
  startClipPathEditing,
  stopClipPathEditing,
  updateClipPathPoint,
} from './editing/clip-path';
export {
  appendPathPoint,
  cancelPlacement,
  closeAndStopPathDrawing,
  commitAndStopPathDrawing,
  placeElement,
  startMotionPathEditing,
  startPathDrawing,
  startPathEditing,
  startPlacement,
  stopMotionPathEditing,
  stopPathDrawing,
  stopPathEditing,
  validateEditorConfig,
} from './editing/commands';
export type { PreflightConfig, PreflightDiagnostic, PreflightRule, PreflightSeverity } from './editing/preflight';
export { runPreflightDiagnostics } from './editing/preflight';
export type { ElementDefaults, PluginDefaults } from './element-defaults';
export { getElementDefaults } from './element-defaults';
