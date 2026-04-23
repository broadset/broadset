/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { createScreenRenderer, DATA_ATTRIBUTES } from '../index';
import { createDocument, createElement } from '../screen-renderer/test-helpers';

function createHost(): HTMLDivElement {
  const host = document.createElement('div');

  host.style.width = '1920px';
  host.style.height = '1080px';

  return host;
}

describe('renderer performance contract', () => {
  /**
   * @description Single-element property changes must touch only the
   *   affected host subtree. The renderer spec's Rendering Performance
   *   requirement demands O(n) complexity with no full-tree rebuild; we
   *   assert this by instrumenting `insertBefore` on the element layer
   *   and verifying no root-level reparenting occurs when one of 50
   *   siblings changes position.
   */
  it('does not reparent root hosts when a single element updates', () => {
    const host = createHost();
    const elements = Array.from({ length: 50 }, (_value, index) =>
      createElement({
        id: `node-${String(index)}`,
        type: 'rectangle',
        position: { x: index * 10, y: index * 5 },
      }),
    );
    const controller = createScreenRenderer({ host, document: createDocument(elements) });
    const elementLayer = host.querySelector('[data-broadset-element-layer]');

    if (elementLayer === null) {
      throw new Error('element layer missing');
    }

    let insertBeforeCalls = 0;
    const originalInsertBefore = elementLayer.insertBefore.bind(elementLayer);

    elementLayer.insertBefore = function instrumentedInsertBefore<T extends Node>(newNode: T, referenceNode: Node | null): T {
      insertBeforeCalls += 1;

      return originalInsertBefore(newNode, referenceNode);
    };

    const updated = elements.map((element) =>
      element.id === 'node-25' ? { ...element, position: { x: 999, y: 999 } } : element,
    );

    controller.updateDocument(createDocument(updated));

    // A single element update should not trigger any root-level
    // reparenting — the identity-preserving reconciler leaves every
    // root in place.
    expect(insertBeforeCalls).toBe(0);

    controller.destroy();
  });

  /**
   * @description A fresh element insertion must touch the DOM only
   *   once (one insertBefore call for the new node) and leave
   *   pre-existing sibling hosts exactly where they were.
   */
  it('performs exactly one root-level insertion when adding a single element', () => {
    const host = createHost();
    const elements = Array.from({ length: 20 }, (_value, index) =>
      createElement({ id: `n${String(index)}`, type: 'rectangle' }),
    );
    const controller = createScreenRenderer({ host, document: createDocument(elements) });
    const elementLayer = host.querySelector('[data-broadset-element-layer]');

    if (elementLayer === null) {
      throw new Error('element layer missing');
    }

    let insertBeforeCalls = 0;
    const originalInsertBefore = elementLayer.insertBefore.bind(elementLayer);

    elementLayer.insertBefore = function instrumentedInsertBefore<T extends Node>(newNode: T, referenceNode: Node | null): T {
      insertBeforeCalls += 1;

      return originalInsertBefore(newNode, referenceNode);
    };

    controller.updateDocument(
      createDocument([...elements, createElement({ id: 'new-tail', type: 'rectangle' })]),
    );

    expect(insertBeforeCalls).toBe(1);
    expect(host.querySelector(`[${DATA_ATTRIBUTES.elementId}="new-tail"]`)).not.toBeNull();

    controller.destroy();
  });

  /**
   * @description Reordering siblings touches each moved sibling at most
   *   once per reorder, not N times. For 3 siblings swapped to a new
   *   order, insertBefore should run at most 3 times on the layer.
   */
  it('bounds insertBefore calls to at most O(n) when reordering siblings', () => {
    const host = createHost();
    const elementA = createElement({ id: 'a', type: 'rectangle' });
    const elementB = createElement({ id: 'b', type: 'rectangle' });
    const elementC = createElement({ id: 'c', type: 'rectangle' });
    const controller = createScreenRenderer({
      host,
      document: createDocument([elementA, elementB, elementC]),
    });
    const elementLayer = host.querySelector('[data-broadset-element-layer]');

    if (elementLayer === null) {
      throw new Error('element layer missing');
    }

    let insertBeforeCalls = 0;
    const originalInsertBefore = elementLayer.insertBefore.bind(elementLayer);

    elementLayer.insertBefore = function instrumentedInsertBefore<T extends Node>(newNode: T, referenceNode: Node | null): T {
      insertBeforeCalls += 1;

      return originalInsertBefore(newNode, referenceNode);
    };

    controller.updateDocument(createDocument([elementC, elementA, elementB]));

    // Three siblings, new order [c, a, b]. The reconciler walks the
    // target order; at most one move per target slot.
    expect(insertBeforeCalls).toBeLessThanOrEqual(3);

    controller.destroy();
  });
});
