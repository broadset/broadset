// ---------------------------------------------------------------------------
// @broadset/renderer — public API
// ---------------------------------------------------------------------------

// Data-attribute contract constants
export { DATA_ELEMENT_CONTENT, DATA_ELEMENT_ID, DATA_OPACITY_TARGET, DATA_VISIBILITY } from './data-attributes';

// Scene tree
export type { SceneNode } from './scene-tree';
export { buildSceneTree } from './scene-tree';

// Background style
export type { BackgroundStyleInput } from './background';
export { applyBackgroundStyle } from './background';

// Component registry
export type { ComponentPlugin, ElementRendererInstance, RendererFactory } from './component-registry';
export { ComponentRegistry } from './component-registry';

// Element renderer
export { ElementRenderer } from './element-renderer';
