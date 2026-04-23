import type { ScreenRendererController, ScreenRendererOptions } from '../../core/contracts';
import { DOMScreenRenderer } from '../../dom/controller';

/**
 * Broadset-compatibility entrypoint. Wraps the DOM controller with
 * Broadset-opinionated semantics: `updateDocument(BroadsetDocument)`,
 * checkerboard preview backdrop policy, Broadset-owned structural
 * `data-*` attributes, and the overlay root exposed for editor chrome
 * portals. Generic consumers should use
 * `createHtmlMotionRenderer` instead, which consumes a `SceneGraph`
 * and knows nothing about `BroadsetDocument`.
 */
export function createScreenRenderer(options: ScreenRendererOptions): ScreenRendererController {
  return new DOMScreenRenderer(options);
}
