import './runtime-canvas';

import { type Layer, readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { exportPsdBytes } from './export';
import { makeDocument, makeElement } from './test-helpers';

/**
 * Phase 5 unit P5.2a — PSD export MUST preserve the `parentId` element
 * tree as native PSD layer groups. The prior exporter flattened every
 * element to the document root; this is the critical parity bug
 * called out in the PSD plan.
 */

function readPsdLayers(bytes: Uint8Array): readonly Layer[] {
  const psd = readPsd(bytes, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
    throwForMissingFeatures: false,
  });

  return psd.children ?? [];
}

describe('PSD export — group preservation', () => {
  /**
   * @description A single-level group MUST export as a PSD layer group
   * (`children` array) not a flat layer. Any PSD reader that opens
   * the file sees the group as a group in the layer panel.
   */
  it('emits a group element as a PSD layer group', () => {
    const group = makeElement('group', { id: 'g1', name: 'My Group' });
    const child = makeElement('rectangle', {
      id: 'c1',
      name: 'Child Rect',
      parentId: 'g1',
      position: { x: 20, y: 20 },
      width: 40,
      height: 30,
    });

    const doc = makeDocument({ elements: [group, child] });
    const bytes = exportPsdBytes(doc);
    const rootLayers = readPsdLayers(bytes);

    expect(rootLayers).toHaveLength(1);

    const psdGroup = rootLayers[0];

    expect(psdGroup?.name).toBe('My Group');
    expect(psdGroup?.children).toBeDefined();
    expect(psdGroup?.children).toHaveLength(1);
    expect(psdGroup?.children?.[0]?.name).toBe('Child Rect');
  });

  /**
   * @description Nested groups (group inside group) preserve the full
   * depth on export. This is the dom-compositor parity bar from the
   * PSD plan.
   */
  it('preserves a three-level nested group hierarchy', () => {
    const outer = makeElement('group', { id: 'outer', name: 'Outer' });
    const middle = makeElement('group', { id: 'middle', name: 'Middle', parentId: 'outer' });
    const leaf = makeElement('rectangle', { id: 'leaf', name: 'Leaf', parentId: 'middle' });

    const doc = makeDocument({ elements: [outer, middle, leaf] });
    const bytes = exportPsdBytes(doc);
    const rootLayers = readPsdLayers(bytes);

    expect(rootLayers[0]?.name).toBe('Outer');
    expect(rootLayers[0]?.children?.[0]?.name).toBe('Middle');
    expect(rootLayers[0]?.children?.[0]?.children?.[0]?.name).toBe('Leaf');
  });

  /**
   * @description Non-group elements at the root remain at the root.
   * A mixed document with both top-level elements and a group round-
   * trips without promoting or demoting layer depth.
   */
  it('mixes top-level elements and groups without re-parenting', () => {
    const top = makeElement('rectangle', { id: 'top', name: 'Top' });
    const group = makeElement('group', { id: 'g1', name: 'Group' });
    const child = makeElement('rectangle', { id: 'c1', name: 'Child', parentId: 'g1' });

    const doc = makeDocument({ elements: [top, group, child] });
    const bytes = exportPsdBytes(doc);
    const rootLayers = readPsdLayers(bytes);

    expect(rootLayers).toHaveLength(2);

    const byName = new Map(rootLayers.map((l) => [l.name, l]));

    expect(byName.get('Top')?.children).toBeUndefined();
    expect(byName.get('Group')?.children?.[0]?.name).toBe('Child');
  });

  /**
   * @description An orphan element (parentId points at a non-existent
   * id) survives at the root rather than being dropped. Importers can
   * produce orphans on malformed input, and no-silent-drops (IO-D-18)
   * applies to the export side too.
   */
  it('promotes orphan children to the root with a warning path', () => {
    const orphan = makeElement('rectangle', { id: 'o1', name: 'Orphan', parentId: 'missing' });

    const doc = makeDocument({ elements: [orphan] });
    const bytes = exportPsdBytes(doc);
    const rootLayers = readPsdLayers(bytes);

    expect(rootLayers).toHaveLength(1);
    expect(rootLayers[0]?.name).toBe('Orphan');
  });
});
