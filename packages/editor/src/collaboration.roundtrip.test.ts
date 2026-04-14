import { type AnimationDefinition, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { applyRemoteChanges, diffDocuments } from './collaboration';
import { makeDocument, makeElement } from './collaboration-test-helpers';

describe('change round-trip fidelity', () => {
  /** @description Diffing empty->one-element and applying the changes to empty MUST produce a state matching the one-element document. */
  it('element add round-trip', () => {
    const el = makeElement({ id: 'el-1', position: { x: 50, y: 75 }, width: 200, height: 150 });
    const prev = makeDocument([]);
    const next = makeDocument([el]);

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    expect(result.elements.length).toBe(1);
    expect(result.elements[0]?.id).toBe('el-1');
    expect(result.elements[0]?.position).toEqual({ x: 50, y: 75 });
    expect(result.elements[0]?.width).toBe(200);
  });

  /** @description Complex multi-change: update el-1, remove el-2, add el-3 - applying the diff produces the target state. */
  it('complex multi-change round-trip', () => {
    const el1 = makeElement({ id: 'el-1', position: { x: 0, y: 0 } });
    const el2 = makeElement({ id: 'el-2' });
    const el1Updated = makeElement({ id: 'el-1', position: { x: 100, y: 50 } });
    const el3 = makeElement({ id: 'el-3', width: 300 });

    const prev = makeDocument([el1, el2]);
    const next = makeDocument([el1Updated, el3]);

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    const resultEl1 = result.elements.find((e) => e.id === 'el-1');

    expect(resultEl1?.position).toEqual({ x: 100, y: 50 });
    expect(result.elements.find((e) => e.id === 'el-2')).toBeUndefined();

    const resultEl3 = result.elements.find((e) => e.id === 'el-3');

    expect(resultEl3).toBeDefined();
    expect(resultEl3?.width).toBe(300);
  });

  /** @description Canvas settings round-trip: changing the canvas width and applying the diff MUST produce a document with the new width. */
  it('canvas settings round-trip', () => {
    const base = createEmptyBroadsetDocument();
    const prev = { ...base };
    const next = { ...base, canvas: { ...base.canvas, width: 500, dpi: 150 } };

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    expect(result.canvas.width).toBe(500);
    expect(result.canvas.dpi).toBe(150);
  });

  /** @description Page add round-trip: adding a page and applying the diff MUST produce a document with the new page. */
  it('page add round-trip', () => {
    const base = createEmptyBroadsetDocument();
    const prev = { ...base };
    const newPage = { id: 'page-2', name: 'Second', overrides: [], locale: null, extensions: {} };
    const next = { ...base, pages: [...base.pages, newPage] };

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    expect(result.pages.length).toBe(base.pages.length + 1);
    expect(result.pages.find((p) => p.id === 'page-2')).toBeDefined();
  });

  /** @description Animation config round-trip: adding an animation and applying the diff MUST produce a document with the animation. */
  it('animation config round-trip', () => {
    const animDef: AnimationDefinition = {
      elementId: 'el-1',
      config: {
        timelines: [{ id: 'tl-1', name: 'Intro', keyframes: [] }],
        stateTimelineBindings: [],
        modifierTimelineBindings: [],
        textAnimator: null,
      },
    };
    const prev = makeDocument([], { animations: [] });
    const next = makeDocument([], { animations: [animDef] });

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    expect(result.animations.length).toBe(1);
    expect(result.animations[0]?.elementId).toBe('el-1');
    expect(result.animations[0]?.config.timelines.length).toBe(1);
  });
});
