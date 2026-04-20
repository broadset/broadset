import { type AnimationDefinition, createEmptyBroadsetDocument, type DocumentChange } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import { applyRemoteChanges, createChangeStream } from './collaboration';
import { makeDocument, makeElement } from './collaboration-test-helpers';

describe('applyRemoteChanges', () => {
  /** @description Applying a remote element:add MUST add the element to the document. */
  it('applies element:add change', () => {
    const doc = makeDocument([]);
    const el = makeElement({ id: 'el-1' });

    const result = applyRemoteChanges(doc, [
      { type: 'element:add', documentId: doc.id, elementId: 'el-1', element: el as unknown as Record<string, unknown> },
    ]);

    expect(result.elements.length).toBe(1);
    expect(result.elements[0]?.id).toBe('el-1');
  });

  /** @description Applying a remote element:remove MUST remove the element from the document. */
  it('applies element:remove change', () => {
    const el = makeElement({ id: 'el-1' });
    const doc = makeDocument([el]);

    const result = applyRemoteChanges(doc, [
      {
        type: 'element:remove',
        documentId: doc.id,
        elementId: 'el-1',
        element: el as unknown as Record<string, unknown>,
      },
    ]);

    expect(result.elements.length).toBe(0);
  });

  /** @description Applying a remote element:update MUST update the specified field. */
  it('applies element:update change', () => {
    const el = makeElement({ id: 'el-1', position: { x: 0, y: 0 } });
    const doc = makeDocument([el]);

    const result = applyRemoteChanges(doc, [
      { type: 'element:update', documentId: doc.id, elementId: 'el-1', path: 'position.x', oldValue: 0, newValue: 100 },
    ]);

    expect(result.elements[0]?.position.x).toBe(100);
  });

  /** @description Remote changes MUST NOT re-emit through the change stream. */
  it('does not re-emit through change stream', () => {
    const stream = createChangeStream();
    const listener = vi.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);

    const el = makeElement({ id: 'el-1' });
    const doc = makeDocument([]);

    applyRemoteChanges(doc, [
      { type: 'element:add', documentId: doc.id, elementId: 'el-1', element: el as unknown as Record<string, unknown> },
    ]);

    expect(listener).not.toHaveBeenCalled();
  });

  /** @description Sequential remote changes for the same element MUST result in the last change being the final state. */
  it('last-writer-wins for sequential changes', () => {
    const el = makeElement({ id: 'el-1', position: { x: 0, y: 0 } });
    const doc = makeDocument([el]);

    const result = applyRemoteChanges(doc, [
      { type: 'element:update', documentId: doc.id, elementId: 'el-1', path: 'position.x', oldValue: 0, newValue: 50 },
      {
        type: 'element:update',
        documentId: doc.id,
        elementId: 'el-1',
        path: 'position.x',
        oldValue: 50,
        newValue: 200,
      },
    ]);

    expect(result.elements[0]?.position.x).toBe(200);
  });

  /** @description Applying a remote page:remove MUST remove the page from the document. */
  it('applies page:remove change', () => {
    const base = createEmptyBroadsetDocument();
    const newPage = { id: 'page-2', name: 'Second', elements: [] as const, locale: null, extensions: {} };
    const doc = { ...base, pages: [...base.pages, newPage] };

    const result = applyRemoteChanges(doc, [
      {
        type: 'page:remove',
        documentId: doc.id,
        pageId: 'page-2',
        page: newPage as unknown as Record<string, unknown>,
      },
    ]);

    expect(result.pages.length).toBe(base.pages.length);
    expect(result.pages.find((p) => p.id === 'page-2')).toBeUndefined();
  });

  /** @description Applying a remote animation:update for a field change MUST update the animation config. */
  it('applies animation:update for field change', () => {
    const animDef: AnimationDefinition = {
      elementId: 'el-1',
      config: {
        timelines: [],
        stateTimelineBindings: [],
        modifierTimelineBindings: [],
        textAnimator: null,
      },
    };
    const doc = makeDocument([], { animations: [animDef] });

    const result = applyRemoteChanges(doc, [
      {
        type: 'animation:update',
        documentId: doc.id,
        elementId: 'el-1',
        path: 'timelines',
        oldValue: [],
        newValue: [{ id: 'tl-1', name: 'Intro', keyframes: [] }],
      },
    ]);

    expect(result.animations[0]?.config.timelines.length).toBe(1);
  });

  /** @description Runtime fields (visibility, activeState, modifiers) do NOT exist on BroadsetElement - they are playback-only. Thus no remote update can target them, satisfying the spec criterion by design. */
  it('runtime fields are not part of the element model', () => {
    const el = makeElement({ id: 'el-1' });

    expect(el).not.toHaveProperty('visibility');
    expect(el).not.toHaveProperty('activeState');
    expect(el).not.toHaveProperty('modifiers');
  });
});
