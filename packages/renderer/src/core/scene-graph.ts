import type { BroadsetElement } from '@broadset/model';

/**
 * Canvas geometry the generic renderer needs in order to size the
 * canvas shell. Kept deliberately minimal — Broadset-specific canvas
 * fields (units, DPI, metadata, bleed/trim/safe-area, background mode)
 * live in the Broadset adapter layer and resolve to this subset when
 * mapping `BroadsetDocument` → `SceneGraph`.
 */
export interface SceneGraphCanvas {
  readonly width: number;
  readonly height: number;
}

/**
 * Normalized scene-graph node consumed by the generic DOM motion
 * renderer. For Phase 3.5 the node shape is an alias of
 * {@link BroadsetElement} — the renderer already derives its behavior
 * from the shared element payload (type / style / content / position)
 * and the element registry. Full genericization of node content into
 * a kind-indexed payload registry is a documented spec gap and
 * lands alongside the format refactor plans that actually need it.
 */
export type SceneNode = BroadsetElement;

/**
 * Generic motion-graphics scene graph consumed by the renderer core.
 * Producers convert their native schema (Broadset document, future
 * Lottie-ish schema, etc.) into this shape via a small adapter; the
 * DOM controller then has a single shape to traverse regardless of
 * which upstream producer supplied it.
 */
export interface SceneGraph {
  readonly canvas: SceneGraphCanvas;
  readonly nodes: readonly SceneNode[];
}
