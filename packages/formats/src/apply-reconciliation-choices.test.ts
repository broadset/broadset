/**
 * Phase 4.9 — `applyReconciliationChoices` lets the demo apply the
 * user's per-modification "Use preserved / Use visual" choices from
 * `FormatReconciliationModal` to the re-imported document before
 * `loadTemplate` runs. Closes pptx-known-gaps §A1.
 */
import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  styleSchema,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { applyReconciliationChoices, type ReconciliationChoice } from './apply-reconciliation-choices';
import type { DocumentReconciliationModification } from './import-document-types';

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 400,
    height: 300,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
    backgroundColor: '#ffffff',
    ...overrides,
  };
}

function makeStyle(overrides: Partial<BroadsetElementStyleInput> = {}): BroadsetElementStyle {
  return styleSchema.parse({ opacity: 1, ...overrides });
}

function makeRect(id: string, overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id,
    type: 'rectangle',
    name: id,
    locked: false,
    position: { x: 10, y: 10 },
    width: 100,
    height: 50,
    rotation: 0,
    style: makeStyle(),
    content: '',
    parentId: null,
    groupId: null,
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    componentRef: null,
    typeConfig: null,
    autoSize: 'fixed',
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
    ...overrides,
  } as BroadsetElement;
}

function makeDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  return {
    id: 'doc-apply-choices',
    name: 'Apply Choices Doc',
    documentMode: 'screen',
    canvas: makeCanvas(),
    elements: [...elements],
    pages: [{ id: 'page-1', name: 'Page 1', elements: [], locale: null, extensions: {} }],
    animations: [],
    dataSchema: { fields: [] },
  } as BroadsetDocument;
}

describe('applyReconciliationChoices', () => {
  /**
   * @description All-visual choices leave the document untouched —
   * `'visual'` is the silent default that has shipped since Phase 8.
   */
  it('keeps the current document when every choice is "visual"', () => {
    const preserved = makeRect('rect-1', { position: { x: 5, y: 5 } });
    const current = makeRect('rect-1', { position: { x: 50, y: 60 } });
    const doc = makeDocument([current]);
    const modifications: readonly DocumentReconciliationModification[] = [
      {
        id: 'rect-1',
        preservedElement: preserved,
        currentElement: current,
      },
    ];
    const choices = new Map<string, ReconciliationChoice>([['rect-1', 'visual']]);

    const result = applyReconciliationChoices(doc, modifications, choices);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]).toBe(current);
  });

  /**
   * @description A `'preserved'` choice for one modification swaps that
   * element back to its last-Broadset-export snapshot, while
   * unspecified-choice modifications stay on the visual branch
   * (default). Elements outside the modifications bucket are untouched.
   */
  it('swaps the element to its preserved version for "preserved" choices only', () => {
    const preservedRect = makeRect('rect-1', { position: { x: 5, y: 5 } });
    const currentRect = makeRect('rect-1', { position: { x: 50, y: 60 } });
    const preservedText = makeRect('text-1', { content: 'old' });
    const currentText = makeRect('text-1', { content: 'new' });
    const untouched = makeRect('rect-2');
    const doc = makeDocument([currentRect, currentText, untouched]);
    const modifications: readonly DocumentReconciliationModification[] = [
      { id: 'rect-1', preservedElement: preservedRect, currentElement: currentRect },
      { id: 'text-1', preservedElement: preservedText, currentElement: currentText },
    ];
    const choices = new Map<string, ReconciliationChoice>([['rect-1', 'preserved']]);

    const result = applyReconciliationChoices(doc, modifications, choices);

    expect(result.elements[0]).toBe(preservedRect);
    expect(result.elements[1]).toBe(currentText);
    expect(result.elements[2]).toBe(untouched);
    // Pure: returns a new array.
    expect(result.elements).not.toBe(doc.elements);
  });

  /**
   * @description Empty modifications short-circuit and return the input
   * document reference. Lets callers invoke unconditionally without
   * forcing an `elements` clone for clean round-trips.
   */
  it('returns the same document reference when modifications is empty', () => {
    const doc = makeDocument([makeRect('rect-1')]);

    const result = applyReconciliationChoices(doc, [], new Map());

    expect(result).toBe(doc);
  });
});
