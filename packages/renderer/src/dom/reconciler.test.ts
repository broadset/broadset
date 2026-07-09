/** @vitest-environment jsdom */

import { resolveContentAsPlainString } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createScreenRenderer, DATA_ATTRIBUTES, type RendererPlugin } from '../index';
import { createDocument, createElement } from '../screen-renderer/test-helpers';

function createHost(): HTMLDivElement {
  const host = document.createElement('div');

  host.style.width = '1280px';
  host.style.height = '720px';

  return host;
}

function queryElementHost(host: HTMLElement, id: string): HTMLElement {
  const node = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementId}="${id}"]`);

  if (node === null) {
    throw new Error(`element host for ${id} not found`);
  }

  return node;
}

describe('keyed reconciliation — DOM identity stability', () => {
  /**
   * @description Updating one element must not replace the underlying host
   *   DOM nodes of OTHER elements. The reconciler must preserve node
   *   identity by key across updates so editor chrome holding direct DOM
   *   references (portals, resize observers) keeps working.
   */
  it('preserves sibling host identity when only one element updates', () => {
    const host = createHost();
    const initial = [
      createElement({ id: 'a', type: 'rectangle' }),
      createElement({ id: 'b', type: 'rectangle' }),
      createElement({ id: 'c', type: 'rectangle' }),
    ];
    const controller = createScreenRenderer({ host, document: createDocument(initial) });

    const beforeA = queryElementHost(host, 'a');
    const beforeB = queryElementHost(host, 'b');
    const beforeC = queryElementHost(host, 'c');

    controller.updateDocument(
      createDocument(
        initial.map((el) => (el.id === 'b' ? { ...el, position: { x: 99, y: 99 } } : el)),
      ),
    );

    expect(queryElementHost(host, 'a')).toBe(beforeA);
    expect(queryElementHost(host, 'b')).toBe(beforeB);
    expect(queryElementHost(host, 'c')).toBe(beforeC);

    controller.destroy();
  });

  /**
   * @description Inserting a new element must not remount or move the
   *   existing nodes. Added node appears at the correct position; all
   *   pre-existing nodes keep their exact DOM identity.
   */
  it('inserts a new element without remounting existing siblings', () => {
    const host = createHost();
    const elementA = createElement({ id: 'a', type: 'rectangle' });
    const elementB = createElement({ id: 'b', type: 'rectangle' });
    const initial = [elementA, elementB];
    const controller = createScreenRenderer({ host, document: createDocument(initial) });
    const beforeA = queryElementHost(host, 'a');
    const beforeB = queryElementHost(host, 'b');

    controller.updateDocument(
      createDocument([elementA, createElement({ id: 'inserted', type: 'rectangle' }), elementB]),
    );

    expect(queryElementHost(host, 'a')).toBe(beforeA);
    expect(queryElementHost(host, 'b')).toBe(beforeB);
    expect(queryElementHost(host, 'inserted')).not.toBeNull();

    controller.destroy();
  });

  /**
   * @description Removing an element must not affect the DOM identity of
   *   the remaining siblings. The removed node's host is detached; the
   *   kept nodes stay in place without being re-created.
   */
  it('removes an element without recreating remaining hosts', () => {
    const host = createHost();
    const elementA = createElement({ id: 'a', type: 'rectangle' });
    const elementB = createElement({ id: 'b', type: 'rectangle' });
    const elementC = createElement({ id: 'c', type: 'rectangle' });
    const controller = createScreenRenderer({
      host,
      document: createDocument([elementA, elementB, elementC]),
    });
    const beforeA = queryElementHost(host, 'a');
    const beforeC = queryElementHost(host, 'c');

    controller.updateDocument(createDocument([elementA, elementC]));

    expect(queryElementHost(host, 'a')).toBe(beforeA);
    expect(queryElementHost(host, 'c')).toBe(beforeC);
    expect(host.querySelector(`[${DATA_ATTRIBUTES.elementId}="b"]`)).toBeNull();

    controller.destroy();
  });

  /**
   * @description Reordering siblings must preserve each host's DOM
   *   identity; only the parent's child-order changes.
   */
  it('preserves host identity when siblings are reordered', () => {
    const host = createHost();
    const elementA = createElement({ id: 'a', type: 'rectangle' });
    const elementB = createElement({ id: 'b', type: 'rectangle' });
    const elementC = createElement({ id: 'c', type: 'rectangle' });
    const controller = createScreenRenderer({
      host,
      document: createDocument([elementA, elementB, elementC]),
    });
    const beforeA = queryElementHost(host, 'a');
    const beforeB = queryElementHost(host, 'b');
    const beforeC = queryElementHost(host, 'c');

    controller.updateDocument(createDocument([elementC, elementA, elementB]));

    expect(queryElementHost(host, 'a')).toBe(beforeA);
    expect(queryElementHost(host, 'b')).toBe(beforeB);
    expect(queryElementHost(host, 'c')).toBe(beforeC);

    // Verify the reordered DOM order matches the new array order.
    const elementLayer = host.querySelector('[data-broadset-element-layer]');

    if (elementLayer === null) {
      throw new Error('element layer missing');
    }

    const orderedIds = Array.from(elementLayer.children).map((child) =>
      child.getAttribute(DATA_ATTRIBUTES.elementId),
    );

    expect(orderedIds).toEqual(['c', 'a', 'b']);

    controller.destroy();
  });

  /**
   * @description When a child of a boolean-operation group changes, the
   *   group must recompute its combined path. The controller must detect
   *   the child-level change and invalidate the composite parent, since
   *   the parent element itself did not change. This is the composite
   *   child-dependency requirement from the renderer refactor plan.
   */
  it('invalidates boolean-group rendering when a child path changes', () => {
    const host = createHost();
    const group = createElement({
      id: 'group',
      type: 'group',
      booleanOperation: 'union',
      width: 100,
      height: 100,
    });
    const childA = createElement({
      id: 'child-a',
      type: 'path',
      parentId: 'group',
      content: 'M0 0 L10 10 L20 0 Z',
    });
    const childB = createElement({
      id: 'child-b',
      type: 'path',
      parentId: 'group',
      content: 'M5 0 L15 10 L25 0 Z',
    });
    const controller = createScreenRenderer({
      host,
      document: createDocument([group, childA, childB]),
    });

    const groupHost = queryElementHost(host, 'group');
    const firstPath = groupHost.querySelector('path');

    expect(firstPath).not.toBeNull();

    const firstPathData = firstPath?.getAttribute('d') ?? '';

    // Change child-a's path geometry. The group element itself is unchanged.
    const updatedChildA = { ...childA, content: 'M0 0 L50 50 L100 0 Z' };

    controller.updateDocument(createDocument([group, updatedChildA, childB]));

    const secondPath = groupHost.querySelector('path');

    expect(secondPath).not.toBeNull();

    const secondPathData = secondPath?.getAttribute('d') ?? '';

    expect(secondPathData).not.toBe(firstPathData);

    controller.destroy();
  });

  /**
   * @description When a single element's CONTENT changes, that element's
   *   renderer update is called exactly once and other elements receive
   *   no update calls. This is the dirty-classification acceptance
   *   criterion: only the dirty node should be touched.
   */
  it('only invokes renderer.update on the dirty element when content changes', () => {
    const updateCounts = new Map<string, number>();
    const plugin: RendererPlugin = {
      type: 'custom',
      rendererFactory: ({ element, host: rendererHost }) => {
        rendererHost.textContent = resolveContentAsPlainString(element.content);

        return {
          update(nextElement) {
            updateCounts.set(nextElement.id, (updateCounts.get(nextElement.id) ?? 0) + 1);
            rendererHost.textContent = resolveContentAsPlainString(nextElement.content);
          },
          destroy() {
            rendererHost.textContent = '';
          },
        };
      },
    };
    const host = createHost();
    const initial = [
      createElement({ id: 'x', type: 'custom', content: 'X1' }),
      createElement({ id: 'y', type: 'custom', content: 'Y1' }),
      createElement({ id: 'z', type: 'custom', content: 'Z1' }),
    ];
    const controller = createScreenRenderer({
      host,
      document: createDocument(initial),
      plugins: [plugin],
    });

    updateCounts.clear();

    controller.updateDocument(
      createDocument(
        initial.map((el) => (el.id === 'y' ? { ...el, content: 'Y2' } : el)),
      ),
    );

    expect(updateCounts.get('y')).toBe(1);
    expect(updateCounts.get('x')).toBeUndefined();
    expect(updateCounts.get('z')).toBeUndefined();

    controller.destroy();
  });
});
