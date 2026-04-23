import type { BroadsetDocument } from '@broadset/model';

import { DOMScreenRenderer } from '../dom/controller';
import type {
  RendererPlugin,
  RenderSettings,
  ScreenRendererController,
} from './contracts';
import type { RuntimeServices } from './runtime';
import type { SceneGraph } from './scene-graph';

export interface HtmlMotionRendererOptions {
  readonly host: HTMLElement;
  readonly scene?: SceneGraph;
  readonly plugins?: readonly RendererPlugin[];
  readonly settings?: RenderSettings;
  readonly runtime?: RuntimeServices;
}

export interface HtmlMotionRendererController extends Omit<ScreenRendererController, 'updateDocument'> {
  updateScene(scene: SceneGraph): void;
}

/**
 * Generic HTML motion-graphics renderer entrypoint. Consumes a
 * {@link SceneGraph} plus optional runtime services; knows nothing
 * about `BroadsetDocument`. Broadset-specific wrappers live in
 * `adapters/broadset/` and compose over this entry point.
 *
 * The returned controller mirrors `ScreenRendererController` apart
 * from the document→scene naming: `updateScene(scene)` replaces
 * `updateDocument(document)`.
 */
export function createHtmlMotionRenderer(options: HtmlMotionRendererOptions): HtmlMotionRendererController {
  const controller = new DOMScreenRenderer({
    host: options.host,
    ...(options.scene === undefined ? {} : { document: sceneToDocument(options.scene) }),
    ...(options.plugins === undefined ? {} : { plugins: options.plugins }),
    ...(options.settings === undefined ? {} : { settings: options.settings }),
    ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
  });

  return {
    get host() {
      return controller.host;
    },
    updateScene(scene) {
      controller.updateDocument(sceneToDocument(scene));
    },
    updateSettings(settings) {
      controller.updateSettings(settings);
    },
    getOverlayRoot() {
      return controller.getOverlayRoot();
    },
    destroy() {
      controller.destroy();
    },
  };
}

/**
 * Internal-only reverse adapter: pack a normalized `SceneGraph` back
 * into the `BroadsetDocument` shape the DOM controller still consumes
 * under the hood. This is a compatibility shim for Phase 3.5 — the
 * DOM controller and element renderers are ported to `SceneGraph`
 * incrementally in later phases.
 */
function sceneToDocument(scene: SceneGraph): BroadsetDocument {
  const document: BroadsetDocument = {
    id: 'scene',
    name: 'scene',
    documentMode: 'screen',
    canvas: {
      width: scene.canvas.width,
      height: scene.canvas.height,
      unit: 'px',
      dpi: 96,
      padding: [0, 0, 0, 0],
      backgroundMode: 'solid',
      backgroundColor: '#000000',
    },
    elements: [...scene.nodes],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
    extensions: {},
  };

  return document;
}
