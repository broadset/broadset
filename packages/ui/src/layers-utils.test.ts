import { describe, expect, it } from 'vitest';

import {
  computeDropPosition,
  DROP_AFTER_ZONE_RATIO,
  DROP_PARENT_ZONE_RATIO,
  isDescendantInLayerList,
} from './layers-utils';
import type { LayerInfo } from './panel-types';

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function layer(id: string, depth = 0, type: LayerInfo['type'] = 'rectangle'): LayerInfo {
  return { id, type, name: id, locked: false, visible: true, depth, hasChildren: type === 'group' };
}

/* ------------------------------------------------------------------ */
/*  isDescendantInLayerList                                            */
/* ------------------------------------------------------------------ */

describe('isDescendantInLayerList', () => {
  const flat: readonly LayerInfo[] = [
    layer('root-group', 0, 'group'),
    layer('child-a', 1),
    layer('sub-group', 1, 'group'),
    layer('grandchild', 2),
    layer('sibling', 0),
  ];

  /** @description Direct child must be recognized as descendant. */
  it('detects direct child as descendant', () => {
    expect(isDescendantInLayerList(flat, 'root-group', 'child-a')).toBe(true);
  });

  /** @description Grandchild must be recognized as descendant of root group. */
  it('detects grandchild as descendant', () => {
    expect(isDescendantInLayerList(flat, 'root-group', 'grandchild')).toBe(true);
  });

  /** @description Sibling at same depth is not a descendant. */
  it('rejects sibling at same depth', () => {
    expect(isDescendantInLayerList(flat, 'root-group', 'sibling')).toBe(false);
  });

  /** @description Parent is not a descendant of its own child. */
  it('rejects ancestor as descendant of child', () => {
    expect(isDescendantInLayerList(flat, 'child-a', 'root-group')).toBe(false);
  });

  /** @description Missing source ID returns false. */
  it('returns false for nonexistent source', () => {
    expect(isDescendantInLayerList(flat, 'nonexistent', 'child-a')).toBe(false);
  });

  /** @description Empty list always returns false. */
  it('returns false for empty layer list', () => {
    expect(isDescendantInLayerList([], 'a', 'b')).toBe(false);
  });

  /** @description Self-check: a node is not its own descendant. */
  it('does not treat self as descendant', () => {
    expect(isDescendantInLayerList(flat, 'root-group', 'root-group')).toBe(false);
  });

  /** @description Nested group's child recognized as descendant of the nested group. */
  it('detects child of nested group', () => {
    expect(isDescendantInLayerList(flat, 'sub-group', 'grandchild')).toBe(true);
  });

  /** @description Nested group's child is NOT a descendant of siblings in the same group. */
  it('grandchild is not descendant of sibling child-a', () => {
    expect(isDescendantInLayerList(flat, 'child-a', 'grandchild')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  computeDropPosition                                                */
/* ------------------------------------------------------------------ */

describe('computeDropPosition', () => {
  const rowHeight = 40;

  /** @description Top portion of the row produces 'before' position. */
  it('returns before for top zone', () => {
    const y = rowHeight * DROP_PARENT_ZONE_RATIO * 0.5;

    expect(computeDropPosition(y, rowHeight, false)).toBe('before');
  });

  /** @description Bottom portion of the row produces 'after' position. */
  it('returns after for bottom zone', () => {
    const y = rowHeight * DROP_AFTER_ZONE_RATIO + 1;

    expect(computeDropPosition(y, rowHeight, false)).toBe('after');
  });

  /** @description Middle zone on a group target produces 'inside'. */
  it('returns inside for middle zone on group', () => {
    const y = (rowHeight * (DROP_PARENT_ZONE_RATIO + DROP_AFTER_ZONE_RATIO)) / 2;

    expect(computeDropPosition(y, rowHeight, true)).toBe('inside');
  });

  /** @description Middle zone on a non-group target falls back to 'before'. */
  it('returns before for middle zone on non-group', () => {
    const y = (rowHeight * (DROP_PARENT_ZONE_RATIO + DROP_AFTER_ZONE_RATIO)) / 2;

    expect(computeDropPosition(y, rowHeight, false)).toBe('before');
  });

  /** @description Exact boundary at parent zone limit still counts as before. */
  it('returns before at exact parent zone boundary', () => {
    const y = rowHeight * DROP_PARENT_ZONE_RATIO;

    expect(computeDropPosition(y, rowHeight, false)).toBe('before');
  });

  /** @description Exact boundary at after zone start counts as after. */
  it('returns after at exact after zone boundary', () => {
    const y = rowHeight * DROP_AFTER_ZONE_RATIO;

    expect(computeDropPosition(y, rowHeight, false)).toBe('after');
  });
});
