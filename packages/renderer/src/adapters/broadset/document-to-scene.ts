import type { BroadsetDocument } from '@broadset/model';

import type { SceneGraph } from '../../core/scene-graph';

/**
 * Map a `BroadsetDocument` to the generic {@link SceneGraph} shape
 * consumed by the renderer core.
 *
 * Phase 3.5 scope: this is where Broadset-specific document concerns
 * (canvas units/dpi/metadata, per-page element overrides, asset
 * registry, dynamic data schema) are flattened into the renderer's
 * minimal scene view. The current implementation is structural —
 * it pulls `canvas.{width,height}` and the document element list —
 * because the element-renderer layer still consumes the
 * `BroadsetElement` payload directly. Broader genericization lands
 * alongside the format tracks that need it.
 */
export function documentToScene(document: BroadsetDocument): SceneGraph {
  return {
    canvas: {
      width: document.canvas.width,
      height: document.canvas.height,
    },
    nodes: document.elements,
  };
}
