/**
 * Compatibility re-export shim. The renderer's internals were split in
 * Phase 3.1 of the renderer refactor; this file now simply re-exports the
 * relocated symbols so historical package-internal imports keep working.
 *
 * New code should import from the package barrel (`@broadset/renderer`) or,
 * when extending internals, from the dedicated modules under `core/`,
 * `dom/`, and `adapters/broadset/`.
 */

export { createScreenRenderer } from '../adapters/broadset/create-screen-renderer';
export {
  BroadsetScreenRendererElement,
  defineBroadsetScreenRenderer,
} from '../adapters/broadset/custom-element';
export {
  BROADSET_STRUCTURAL_ATTRIBUTES,
  DATA_ATTRIBUTES,
  DEFAULT_PERSPECTIVE_PX,
  type ElementRendererFactory,
  type ElementRendererFactoryParams,
  type ElementRendererInstance,
  type RendererPlugin,
  type RenderSettings,
  type ScreenRendererController,
  type ScreenRendererOptions,
} from '../core/contracts';
