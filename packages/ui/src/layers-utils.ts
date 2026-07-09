import type { LayerInfo } from './panel-types';

export type LayerDropPosition = 'before' | 'inside' | 'after';

/**
 * DnD constants for hit-testing drop zones within a layer row.
 * - 0 .. PARENT_ZONE_RATIO of height → 'before'
 * - PARENT_ZONE_RATIO .. AFTER_ZONE_START → 'inside' (groups only)
 * - AFTER_ZONE_START .. 1.0 → 'after'
 */
export const DROP_PARENT_ZONE_RATIO = 0.55;
export const DROP_AFTER_ZONE_RATIO = 0.82;
export const INDENT_PER_LEVEL = 16;

/**
 * Pure-function descendant detection on a flat, depth-annotated layer list.
 *
 * Walks forward from `dragSourceId` and treats every consecutive layer with
 * `depth > sourceDepth` as a descendant.
 */
export function isDescendantInLayerList(layers: readonly LayerInfo[], dragSourceId: string, targetId: string): boolean {
  const sourceIndex = layers.findIndex((l) => l.id === dragSourceId);

  if (sourceIndex < 0) {
    return false;
  }

  const sourceDepth = layers[sourceIndex]?.depth ?? 0;

  for (let i = sourceIndex + 1; i < layers.length; i++) {
    const layer = layers[i];

    if (layer === undefined) {
      break;
    }

    if ((layer.depth ?? 0) <= sourceDepth) {
      break;
    }

    if (layer.id === targetId) {
      return true;
    }
  }

  return false;
}

/**
 * Compute the drop position for a drag-over event given the pointer Y
 * offset (relative to the row's top), the row height, and whether the
 * target layer is a group.
 */
export function computeDropPosition(yOffset: number, rowHeight: number, isGroup: boolean): LayerDropPosition {
  const parentLimit = rowHeight * DROP_PARENT_ZONE_RATIO;
  const afterStart = rowHeight * DROP_AFTER_ZONE_RATIO;

  if (yOffset <= parentLimit) {
    return 'before';
  }

  if (yOffset >= afterStart) {
    return 'after';
  }

  return isGroup ? 'inside' : 'before';
}
