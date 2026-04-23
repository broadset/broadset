import type { BroadsetElement } from '@broadset/model';

import type { ElementRendererFactory, ElementRendererInstance } from '../core/contracts';
import { createBooleanGroupRenderer } from './boolean-group';
import { createPlainGroupRenderer } from './plain-group';

/**
 * Group element dispatcher. Groups split into two independent
 * responsibilities (Phase 3.3):
 *
 * - Plain group — structural container only. No inner DOM; the scene-tree
 *   traversal mounts child hosts inside this group's content host.
 * - Boolean composite group — emits a single combined SVG `<path>` built
 *   from child path data via the declared boolean operation.
 *
 * The dispatcher picks the right factory per mount and swaps on update
 * if the boolean-operation flag flips between `null` and a real op. This
 * keeps the two renderers side-by-side without either knowing about
 * the other's concerns.
 */
export function createGroupRenderer(): ElementRendererFactory {
  const plainFactory = createPlainGroupRenderer();
  const booleanFactory = createBooleanGroupRenderer();

  return ({ document: initialDoc, element, host }) => {
    let activeInstance: ElementRendererInstance = pickFactory(element)({
      document: initialDoc,
      element,
      host,
    });
    let activeMode: 'plain' | 'boolean' = modeFor(element);

    return {
      update(nextElement, nextDocument) {
        const nextMode = modeFor(nextElement);

        if (nextMode !== activeMode) {
          activeInstance.destroy();
          activeInstance = pickFactory(nextElement)({
            document: nextDocument,
            element: nextElement,
            host,
          });
          activeMode = nextMode;

          return;
        }

        activeInstance.update(nextElement, nextDocument);
      },
      destroy() {
        activeInstance.destroy();
      },
    };
  };

  function modeFor(element: BroadsetElement): 'plain' | 'boolean' {
    return element.booleanOperation === null ? 'plain' : 'boolean';
  }

  function pickFactory(element: BroadsetElement): ElementRendererFactory {
    return modeFor(element) === 'plain' ? plainFactory : booleanFactory;
  }
}
