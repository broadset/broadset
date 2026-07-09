import type { BroadsetElement } from '@broadset/model';

import type { ElementRendererFactory } from '../../core/contracts';

/**
 * Convenience factory for stateless per-type renderers. The returned
 * `ElementRendererInstance` reuses the given `update` function for both the
 * initial mount and subsequent updates, and clears the host on destroy.
 *
 * Simple renderers do not depend on document-wide state, so the
 * `ElementRendererInstance.update(element, document)` second parameter is
 * intentionally ignored here — it only matters for composite renderers that
 * resolve child data on every update (e.g. boolean groups).
 */
export function createSimpleRenderer(
  update: (host: HTMLElement, element: BroadsetElement) => void,
): ElementRendererFactory {
  return ({ element, host }) => {
    update(host, element);

    return {
      update(nextElement) {
        update(host, nextElement);
      },
      destroy() {
        host.replaceChildren();
        host.textContent = '';
      },
    };
  };
}
