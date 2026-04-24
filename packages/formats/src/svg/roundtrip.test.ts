/**
 * P7.5 — SVG reconciliation.
 *
 * `reconcileSvg` wraps `_shared/reconcile/reconcile(...)` for the
 * SVG round-trip flow. Given a preserved Broadset document (from a
 * previous export, carried in the `.bsp` or recovered from the
 * `<metadata>` packet on re-import) plus a current SVG string,
 * emits a `ReconcileResult` describing modifications, additions,
 * deletions, and hash-recovered matches per
 * `project/spec/formats/svg.md` → "Reconciliation Reporting".
 */
import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  rgbColor,
  styleSchema,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportSvgString, reconcileSvg } from './index';

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 400,
    height: 300,
    unit: 'px' as const,
    dpi: 72,
    padding: [0, 0, 0, 0] as [number, number, number, number],
    backgroundColor: '#ffffff',
    backgroundMode: 'solid' as const,
    ...overrides,
  };
}

function makeStyle(overrides: Partial<BroadsetElementStyleInput> = {}): BroadsetElementStyle {
  return styleSchema.parse({
    opacity: 1,
    ...overrides,
  });
}

function makeElement(overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${String(Math.random()).slice(2, 8)}`,
    type: 'rectangle',
    name: 'Test Element',
    content: '',
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    parentId: null,
    groupId: null,
    style: makeStyle(),
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    componentRef: null,
    typeConfig: null,
    autoSize: 'fixed' as const,
    locked: false,
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
    ...overrides,
  } as BroadsetElement;
}

function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-rt',
    name: 'Round-Trip Test',
    documentMode: 'screen' as const,
    canvas: makeCanvas(),
    elements: [],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
    ...overrides,
  } as BroadsetDocument;
}

describe('P7.5 — Round-trip reconciliation: identical documents', () => {
  /**
   * @description A document that was exported and re-imported
   * without any external modification MUST produce an empty
   * reconciliation result — no modifications, additions, deletions,
   * or hash recoveries.
   */
  it('emits an empty result when the document round-trips unchanged', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'alpha', type: 'rectangle' }),
        makeElement({ id: 'beta', type: 'text', content: 'hi' }),
      ],
    });

    const svg = await exportSvgString(doc);
    const result = await reconcileSvg({ preserved: doc, currentSvg: svg });

    expect(result.modifications).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
    expect(result.recoveredByHash).toHaveLength(0);
  });
});

describe('P7.5 — Modifications', () => {
  /**
   * @description An element whose size changed between preservation
   * and the current visual MUST surface as a modification in the
   * reconciliation result with per-field differences.
   */
  it('reports a modification when element size changes', async () => {
    const preserved = makeDocument({
      elements: [makeElement({ id: 'rect-1', type: 'rectangle', width: 100, height: 50 })],
    });
    const current = makeDocument({
      elements: [makeElement({ id: 'rect-1', type: 'rectangle', width: 200, height: 75 })],
    });

    const svg = await exportSvgString(current);
    const result = await reconcileSvg({ preserved, currentSvg: svg });

    expect(result.modifications).toHaveLength(1);
    expect(result.modifications[0]?.elementId).toBe('rect-1');
    expect(result.modifications[0]?.differences.length).toBeGreaterThan(0);
  });
});

describe('P7.5 — Additions', () => {
  /**
   * @description An element added to the current visual with no
   * matching id in the preserved metadata MUST surface as an
   * addition — the demo UI stages it on an "Imported from SVG"
   * landing so the user decides whether to keep it.
   */
  it('reports a new element as an addition', async () => {
    const preserved = makeDocument({
      elements: [makeElement({ id: 'a', type: 'rectangle' })],
    });
    const current = makeDocument({
      elements: [
        makeElement({ id: 'a', type: 'rectangle' }),
        makeElement({ id: 'new-one', type: 'text', content: 'brand new' }),
      ],
    });

    const svg = await exportSvgString(current);
    const result = await reconcileSvg({ preserved, currentSvg: svg });

    expect(result.additions.some((el) => el.id === 'new-one')).toBe(true);
  });
});

describe('P7.5 — Deletions', () => {
  /**
   * @description An element present in preservation but missing
   * from the current visual MUST surface as a deletion — the user
   * confirms in the demo UI before Broadset drops the element.
   */
  it('reports a removed element as a deletion', async () => {
    const preserved = makeDocument({
      elements: [
        makeElement({ id: 'gone', type: 'rectangle' }),
        makeElement({ id: 'still-here', type: 'text', content: 'x' }),
      ],
    });
    const current = makeDocument({
      elements: [makeElement({ id: 'still-here', type: 'text', content: 'x' })],
    });

    const svg = await exportSvgString(current);
    const result = await reconcileSvg({ preserved, currentSvg: svg });

    expect(result.deletions.some((el) => el.id === 'gone')).toBe(true);
  });
});

describe('P7.5 — Hash-recovered matches (tag stripped)', () => {
  /**
   * @description When the external editor strips `data-bs-*` from
   * an element but the geometry / content / style hash still
   * matches the preserved fingerprint, reconciliation MUST
   * re-link the pair via `recoveredByHash` — avoiding a spurious
   * delete + add event per the spec's content-hash fallback
   * contract.
   */
  it('re-links stripped-tag elements via fingerprint match', async () => {
    const preservedElement = makeElement({
      id: 'original-id',
      type: 'rectangle',
      width: 120,
      height: 80,
      style: makeStyle({ fill: rgbColor('#123456') }),
    });
    const preserved = makeDocument({ elements: [preservedElement] });
    // Same visual identity but different id (external editor
    // generated a fresh id on save).
    const current = makeDocument({
      elements: [
        makeElement({
          id: 'renumbered',
          type: 'rectangle',
          width: 120,
          height: 80,
          style: makeStyle({ fill: rgbColor('#123456') }),
        }),
      ],
    });
    const svg = await exportSvgString(current);
    const result = await reconcileSvg({ preserved, currentSvg: svg });

    // The stripped-id element should be recovered-by-hash, not
    // appear as a deletion + addition pair.
    expect(result.recoveredByHash).toHaveLength(1);
    expect(result.recoveredByHash[0]?.preservedElement.id).toBe('original-id');
    expect(result.recoveredByHash[0]?.currentElement.id).toBe('renumbered');
    expect(result.deletions).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
  });
});

describe('P7.5 — Mixed reconciliation', () => {
  /**
   * @description A realistic document with a modification, an
   * addition, and a deletion MUST partition correctly across the
   * four result buckets.
   */
  it('partitions a mixed-change document correctly', async () => {
    const preserved = makeDocument({
      elements: [
        makeElement({ id: 'modified', type: 'rectangle', width: 100, height: 50 }),
        makeElement({ id: 'deleted', type: 'text', content: 'bye' }),
      ],
    });
    const current = makeDocument({
      elements: [
        makeElement({ id: 'modified', type: 'rectangle', width: 150, height: 50 }),
        makeElement({ id: 'added', type: 'ellipse' }),
      ],
    });

    const svg = await exportSvgString(current);
    const result = await reconcileSvg({ preserved, currentSvg: svg });

    expect(result.modifications.some((m) => m.elementId === 'modified')).toBe(true);
    expect(result.additions.some((el) => el.id === 'added')).toBe(true);
    expect(result.deletions.some((el) => el.id === 'deleted')).toBe(true);
  });
});

describe('P7.5 — dirtyElementIds helper', () => {
  /**
   * @description `dirtyElementIds` returns every id whose
   * `extensions.svg.dirty` flag is true — the demo uses this to
   * decide which elements re-export from current Broadset state
   * versus re-emit the preserved original blob byte-for-byte per
   * the spec's dirty-flag discipline.
   */
  it('reports the ids of every dirty element', async () => {
    const { dirtyElementIds } = await import('./roundtrip');
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'clean', extensions: { svg: { dirty: false } } }),
        makeElement({ id: 'dirty-one', extensions: { svg: { dirty: true } } }),
        makeElement({ id: 'dirty-two', extensions: { svg: { dirty: true } } }),
      ],
    });

    expect(dirtyElementIds(doc)).toEqual(['dirty-one', 'dirty-two']);
  });

  /**
   * @description An element with no `extensions.svg` namespace
   * defaults to clean (not dirty) — the flag is opt-in, populated
   * on hydration by the fast-path importer. Elements authored
   * purely in Broadset start clean too.
   */
  it('treats elements without extensions.svg as clean', async () => {
    const { dirtyElementIds } = await import('./roundtrip');
    const doc = makeDocument({
      elements: [makeElement({ id: 'no-ext' })],
    });

    expect(dirtyElementIds(doc)).toEqual([]);
  });
});
