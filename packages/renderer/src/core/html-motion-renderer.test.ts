/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { documentToScene } from '../adapters/broadset/document-to-scene';
import { createHtmlMotionRenderer, DATA_ATTRIBUTES, type SceneGraph } from '../index';
import { createDocument, createElement } from '../screen-renderer/test-helpers';

function createHost(): HTMLDivElement {
  const host = document.createElement('div');

  host.style.width = '800px';
  host.style.height = '600px';

  return host;
}

describe('createHtmlMotionRenderer — generic entry point', () => {
  /**
   * @description The generic renderer entry point must accept a
   *   {@link SceneGraph} — not a `BroadsetDocument` — so non-Broadset
   *   callers can use the renderer core without depending on the
   *   Broadset model package.
   */
  it('renders a SceneGraph without exposing BroadsetDocument at the API boundary', () => {
    const host = createHost();
    const scene: SceneGraph = {
      canvas: { width: 400, height: 200 },
      nodes: [createElement({ id: 'r1', type: 'rectangle' })],
    };
    const controller = createHtmlMotionRenderer({ host, scene });

    expect(host.querySelector(`[${DATA_ATTRIBUTES.elementId}="r1"]`)).not.toBeNull();

    controller.destroy();
  });

  /**
   * @description `updateScene(scene)` must route through the same
   *   reconciliation machinery as `updateDocument(doc)` so generic
   *   callers get keyed identity stability and composite invalidation
   *   semantics identical to the Broadset adapter.
   */
  it('updates via updateScene without remounting unchanged nodes', () => {
    const host = createHost();
    const elementA = createElement({ id: 'a', type: 'rectangle' });
    const elementB = createElement({ id: 'b', type: 'rectangle' });
    const initialScene: SceneGraph = {
      canvas: { width: 400, height: 200 },
      nodes: [elementA, elementB],
    };
    const controller = createHtmlMotionRenderer({ host, scene: initialScene });
    const beforeA = host.querySelector(`[${DATA_ATTRIBUTES.elementId}="a"]`);

    controller.updateScene({
      canvas: initialScene.canvas,
      nodes: [
        { ...elementA, position: { x: 42, y: 8 } },
        elementB,
      ],
    });

    const afterA = host.querySelector(`[${DATA_ATTRIBUTES.elementId}="a"]`);

    expect(afterA).toBe(beforeA);

    controller.destroy();
  });
});

describe('documentToScene adapter', () => {
  /**
   * @description The Broadset-to-scene mapper must project a
   *   `BroadsetDocument` into the generic `SceneGraph` shape so
   *   Broadset producers compose cleanly with the generic renderer
   *   without leaking document-specific fields.
   */
  it('pulls canvas dimensions and element list into the scene graph', () => {
    const element = createElement({ id: 'x', type: 'rectangle' });
    const doc = createDocument([element]);
    const scene = documentToScene(doc);

    expect(scene.canvas.width).toBe(doc.canvas.width);
    expect(scene.canvas.height).toBe(doc.canvas.height);
    expect(scene.nodes).toHaveLength(1);
    expect(scene.nodes[0]?.id).toBe('x');
  });
});
