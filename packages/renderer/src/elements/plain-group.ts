import type { ElementRendererFactory } from '../core/contracts';

/**
 * Plain group renderer. Groups without a boolean operation are purely
 * structural containers — the controller walks the scene tree and mounts
 * each child's host inside this group's content host. The renderer itself
 * contributes no inner DOM; it simply clears the host on mount / update so
 * no stale state from a previous type remains.
 *
 * Boolean composite rendering is a separate responsibility — see
 * {@link createBooleanGroupRenderer} in `boolean-group.ts`.
 */
export function createPlainGroupRenderer(): ElementRendererFactory {
  return ({ host }) => {
    host.textContent = '';

    return {
      update() {
        host.textContent = '';
      },
      destroy() {
        host.replaceChildren();
        host.textContent = '';
      },
    };
  };
}
