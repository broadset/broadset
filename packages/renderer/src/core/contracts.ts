import type { BroadsetDocument, BroadsetElement } from '@broadset/model';

import type { RendererCapabilityOverride } from '../capabilities';

/**
 * Default perspective in pixels applied to the canvas transform layer when the
 * caller does not pass a `perspective` setting. Matches the generic 1000px
 * perspective most 3D CSS examples use and the value historically baked into
 * the Broadset canvas.
 */
export const DEFAULT_PERSPECTIVE_PX = 1000;

/**
 * Runtime render settings sourced from `CanvasSettings` at the call site. Kept
 * separate from the document so that viewport/chrome concerns (perspective,
 * future: zoom/pan) don't leak into the persisted `.bsp` payload.
 */
export interface RenderSettings {
  readonly perspective?: number;
}

/**
 * Data attributes emitted on rendered element nodes. These form cross-package
 * contracts with `@broadset/playback` (animation targets) and
 * `@broadset/editor` (selection/hover resolution). See the renderer spec's
 * Data-Attribute Contract Registry.
 */
export const DATA_ATTRIBUTES = {
  elementId: 'data-element-id',
  elementContent: 'data-element-content',
  opacityTarget: 'data-opacity-target',
  visibility: 'data-visibility',
} as const;

/**
 * Structural `data-broadset-*` attributes emitted by the Broadset adapter on
 * the canvas/overlay/transform layers so export rasterizers, tests, and the
 * demo shell can identify the semantic content root without reaching into
 * implementation details.
 */
export const BROADSET_STRUCTURAL_ATTRIBUTES = {
  canvasTransform: 'data-broadset-canvas-transform',
  canvasRoot: 'data-broadset-canvas-root',
  elementLayer: 'data-broadset-element-layer',
  overlayRoot: 'data-broadset-overlay-root',
} as const;

export interface ElementRendererFactoryParams {
  readonly document: BroadsetDocument;
  readonly element: BroadsetElement;
  readonly host: HTMLElement;
}

export interface ElementRendererInstance {
  update(element: BroadsetElement): void;
  destroy(): void;
}

export type ElementRendererFactory = (params: ElementRendererFactoryParams) => ElementRendererInstance;

export interface RendererPlugin extends RendererCapabilityOverride {
  readonly rendererFactory?: ElementRendererFactory;
}

export interface ScreenRendererOptions {
  readonly host: HTMLElement;
  readonly document?: BroadsetDocument;
  readonly plugins?: readonly RendererPlugin[];
  readonly settings?: RenderSettings;
}

export interface ScreenRendererController {
  readonly host: HTMLElement;
  updateDocument(document: BroadsetDocument): void;
  updateSettings(settings: RenderSettings): void;
  /**
   * Returns the DOM node editor chrome (selection widgets, guides overlays,
   * snap indicators) should portal into. The overlay lives inside the same
   * transform context as element hosts, so chrome inherits scale, pan, and
   * perspective automatically and stays pixel-aligned with elements.
   */
  getOverlayRoot(): HTMLElement;
  destroy(): void;
}

export interface RendererRecord {
  readonly host: HTMLDivElement;
  readonly opacityHost: HTMLDivElement;
  readonly contentHost: HTMLDivElement;
  readonly renderer: ElementRendererInstance;
  readonly type: string;
}
