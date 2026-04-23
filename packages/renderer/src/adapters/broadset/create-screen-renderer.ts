import type { ScreenRendererController, ScreenRendererOptions } from '../../core/contracts';
import { DOMScreenRenderer } from '../../dom/controller';

/**
 * Broadset-compatibility entrypoint. Wraps the generic DOM controller in the
 * Broadset-opinionated preview host (checkerboard backdrop, overlay root,
 * Broadset-owned `data-*` attributes). Kept as a thin façade so callers that
 * historically imported `createScreenRenderer` continue to work unchanged
 * while the internal layering is re-homed in `dom/` and `adapters/broadset/`.
 */
export function createScreenRenderer(options: ScreenRendererOptions): ScreenRendererController {
  return new DOMScreenRenderer(options);
}
