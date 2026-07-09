import { BROADSET_FORMAT_IDS, type BroadsetElement, type BroadsetFormatId } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { markElementExtensionsDirty } from './extensions-dirty';
import { commitInlineText } from './inline-text';
import { createEditorStore } from './store-actions';
import { findElement, makeDocument, makeElement, storeWithElements } from './store-actions-test-helpers';

/**
 * Unit #14 — every element-mutating store action MUST flip every present
 * `extensions.<format>.dirty` flag to `true`. Exporters consult their own
 * flag to decide between re-emitting from the current Broadset state
 * (dirty) or re-emitting the preserved original blob byte-for-byte
 * (clean). Missing this flag on any mutation silently corrupts the
 * round-trip by letting an out-of-date blob clobber new user edits.
 *
 * The `markElementExtensionsDirty` helper is the single implementation
 * of this rule; it is wired into `updateDocumentElement`,
 * `updateDocumentElements`, `commitGroupMove`, and `commitInlineText`.
 * The integration suite below "simulates every store action" per the
 * unit's acceptance condition so any future store action that forgets
 * to go through the helper fails loudly here.
 */
describe('markElementExtensionsDirty', () => {
  /**
   * @description An element with no extensions MUST pass through
   * unchanged. The helper is a no-op when there is nothing to flip so
   * future callers can wire it into universal element updaters without
   * worrying about spuriously creating extensions objects.
   */
  it('returns the same element when extensions is empty', () => {
    const element = makeElement();
    const result = markElementExtensionsDirty(element);

    expect(result).toBe(element);
  });

  /**
   * @description A single present namespace with `dirty: false` MUST
   * be flipped to `dirty: true` and the returned element MUST preserve
   * every unrelated field so no mutation leaks into surrounding state.
   */
  it('flips a single namespace dirty:false flag to true and preserves other fields', () => {
    const element = makeElement({
      extensions: {
        psd: { dirty: false, sourceLayerId: 'layer-7' },
      },
    });

    const result = markElementExtensionsDirty(element);

    expect(result).not.toBe(element);
    expect(getFormatExtension(result, 'psd')).toEqual({ dirty: true, sourceLayerId: 'layer-7' });
  });

  /**
   * @description When all four format namespaces are present, every one
   * MUST be flipped in a single pass so the exporter for any format
   * sees the right flag after a single editor action. No silent partial
   * updates.
   */
  it('flips every present format namespace in one pass', () => {
    const element = makeElement({
      extensions: {
        psd: { dirty: false },
        pdf: { dirty: false },
        pptx: { dirty: false },
        svg: { dirty: false },
      },
    });

    const result = markElementExtensionsDirty(element);

    for (const formatId of BROADSET_FORMAT_IDS) {
      expect(getFormatExtension(result, formatId)?.['dirty']).toBe(true);
    }
  });

  /**
   * @description When the element is already fully dirty the helper
   * MUST return the same reference — referential equality lets Zustand
   * skip spurious re-renders on mutations that did not actually change
   * the effective flag state.
   */
  it('returns the same reference when every present flag is already true', () => {
    const element = makeElement({
      extensions: {
        psd: { dirty: true },
        pdf: { dirty: true },
      },
    });

    const result = markElementExtensionsDirty(element);

    expect(result).toBe(element);
  });

  /**
   * @description Unknown namespaces (outside the four Broadset format
   * ids) MUST pass through unchanged. The helper is conservative — it
   * only touches what it owns so third-party extensions stored on an
   * element are never mutated by the middleware.
   */
  it('leaves unknown namespaces untouched', () => {
    const element = makeElement({
      extensions: {
        psd: { dirty: false },
        customTool: { dirty: false, data: 'preserved' },
      },
    });

    const result = markElementExtensionsDirty(element);

    expect(getFormatExtension(result, 'psd')?.['dirty']).toBe(true);
    expect(result.extensions['customTool']).toEqual({ dirty: false, data: 'preserved' });
  });

  /**
   * @description Defensive against shapes the schema would reject: when
   * a format slot is not a plain object, the helper MUST skip it
   * rather than crash. The element schema rejects such shapes at load
   * time, but middleware MUST never take down the editor on a
   * programmer error.
   */
  it('skips format slots that are not plain objects', () => {
    const element = makeElement({
      extensions: {
        psd: 'not-an-object',
      },
    });

    const result = markElementExtensionsDirty(element);

    expect(result).toBe(element);
  });

  /**
   * @description The helper MUST NOT mutate its input. A caller holding
   * the original element reference can rely on its extensions record
   * being unchanged after the helper returns.
   */
  it('does not mutate the input element', () => {
    const element = makeElement({
      extensions: {
        psd: { dirty: false },
      },
    });

    const before = structuredClone(element.extensions);

    markElementExtensionsDirty(element);

    expect(element.extensions).toEqual(before);
  });
});

describe('EditorStore — dirty flag flipping on element-mutating actions', () => {
  /**
   * @description `updateElementEphemeral` is called at 60fps during
   * drag. Every invocation mutates position/size in place; the flag
   * MUST flip so mid-drag exports from an automated test also see the
   * dirty state. The ephemeral path must not be exempted.
   */
  it('flips dirty on updateElementEphemeral', () => {
    const { store, elementId } = storeWithDirtyCandidate();

    store.getState().updateElementEphemeral(elementId, { position: { x: 10, y: 20 } });

    expectAllFormatsDirty(store, elementId);
  });

  /**
   * @description `commitElementUpdate` is the single-element commit
   * path used by transform drops, keyboard-driven edits, and the
   * properties panel — all of which must mark the element dirty.
   */
  it('flips dirty on commitElementUpdate', () => {
    const { store, elementId } = storeWithDirtyCandidate();

    store.getState().commitElementUpdate(elementId, { width: 200 });

    expectAllFormatsDirty(store, elementId);
  });

  /**
   * @description `commitGroupMove` batches multi-element position
   * updates. Every element in the batch MUST have its dirty flag
   * flipped; a partial flip would corrupt format round-trip for
   * whichever element slipped through.
   */
  it('flips dirty on every element touched by commitGroupMove', () => {
    const firstCandidate = makeDirtyCandidate();
    const secondCandidate = makeDirtyCandidate();
    const store = storeWithElements(firstCandidate, secondCandidate);

    store.getState().commitGroupMove([
      { elementId: firstCandidate.id, position: { x: 1, y: 2 } },
      { elementId: secondCandidate.id, position: { x: 3, y: 4 } },
    ]);

    expectAllFormatsDirty(store, firstCandidate.id);
    expectAllFormatsDirty(store, secondCandidate.id);
  });

  /**
   * @description `updateElementStyle` is the most common style edit
   * path (color picker, stroke panel, etc.). The flag MUST flip on any
   * style change, including single-key partial updates.
   */
  it('flips dirty on updateElementStyle', () => {
    const { store, elementId } = storeWithDirtyCandidate();

    store.getState().updateElementStyle(elementId, { opacity: 0.5 });

    expectAllFormatsDirty(store, elementId);
  });

  /**
   * @description `groupElements` assigns a shared `groupId` to every
   * selected element. Group identity is part of the exported structure
   * so every grouped element MUST flip dirty.
   */
  it('flips dirty on groupElements', () => {
    const first = makeDirtyCandidate();
    const second = makeDirtyCandidate();
    const store = storeWithElements(first, second);

    store.getState().setActiveElements([first.id, second.id]);
    store.getState().groupElements();

    expectAllFormatsDirty(store, first.id);
    expectAllFormatsDirty(store, second.id);
  });

  /**
   * @description `ungroupElements` clears the `groupId` — same
   * argument as groupElements: the exported grouping structure
   * changes, so dirty MUST flip.
   */
  it('flips dirty on ungroupElements', () => {
    const groupId = 'group-1';
    const first = makeDirtyCandidate({ groupId });
    const second = makeDirtyCandidate({ groupId });
    const store = storeWithElements(first, second);

    store.getState().setActiveElements([first.id, second.id]);
    store.getState().ungroupElements();

    expectAllFormatsDirty(store, first.id);
    expectAllFormatsDirty(store, second.id);
  });

  /**
   * @description `commitInlineText` writes sanitized text content from
   * the contenteditable overlay back to the store. It bypasses the
   * store's `updateDocumentElement` utility (it calls `setState`
   * directly) yet must still flip the dirty flag — a missed flip here
   * would let an unchanged PSD/PDF/PPTX/SVG blob overwrite the user's
   * just-typed text on the next export.
   */
  it('flips dirty on commitInlineText', () => {
    const textElement = makeDirtyCandidate({ type: 'text', content: 'original' });
    const store = storeWithElements(textElement);

    commitInlineText(store, textElement.id, 'edited');

    const stored = findElement(store, textElement.id);

    expect(stored?.content).toBe('edited');
    expectAllFormatsDirty(store, textElement.id);
  });

  /**
   * @description `toggleLock` flips the element's `locked` property.
   * Lock state is part of the element shape and round-trips through
   * formats that support it, so the flag MUST flip.
   */
  it('flips dirty on toggleLock', () => {
    const { store, elementId } = storeWithDirtyCandidate();

    store.getState().toggleLock(elementId);

    expectAllFormatsDirty(store, elementId);
  });

  /**
   * @description Non-element-mutating actions MUST NOT flip the flag.
   * `reorderElement` rearranges the elements array but leaves each
   * element's data intact; dirty would be misleading here.
   */
  it('does not flip dirty on reorderElement', () => {
    const first = makeDirtyCandidate();
    const second = makeDirtyCandidate();
    const store = storeWithElements(first, second);

    store.getState().reorderElement(first.id, 'forward');

    expectAllFormatsClean(store, first.id);
    expectAllFormatsClean(store, second.id);
  });

  /**
   * @description `toggleVisibility` mutates a page-level
   * `PageElementInstance.visible` override, not the element itself.
   * Dirty MUST NOT flip because the element's exported representation
   * is unchanged.
   */
  it('does not flip dirty on toggleVisibility', () => {
    const { store, elementId } = storeWithDirtyCandidate();

    store.getState().toggleVisibility(elementId);

    expectAllFormatsClean(store, elementId);
  });

  /**
   * @description Document-replacement actions (`setDocument`,
   * `loadTemplate`, `restoreSnapshot`) load an external baseline. They
   * MUST NOT flip dirty — a just-loaded document's flags represent the
   * authoritative imported state, and overwriting them with `true`
   * would force an unnecessary re-emit on first export.
   */
  it('does not flip dirty on setDocument / loadTemplate', () => {
    const candidate = makeDirtyCandidate();
    const store = createEditorStore();

    store.getState().setDocument(makeDocument([candidate]));
    expectAllFormatsClean(store, candidate.id);

    const otherCandidate = makeDirtyCandidate();

    store.getState().loadTemplate(makeDocument([otherCandidate]));
    expectAllFormatsClean(store, otherCandidate.id);
  });

  /**
   * @description `restoreSnapshot` re-loads the saved document state.
   * Any flags stored in the snapshot MUST be preserved verbatim — the
   * restore is a load, not a mutation.
   */
  it('does not flip dirty on restoreSnapshot', () => {
    const candidate = makeDirtyCandidate();
    const store = storeWithElements(candidate);
    const snapshotId = store.getState().saveSnapshot('baseline');

    store.getState().updateElementStyle(candidate.id, { opacity: 0.1 });
    expectAllFormatsDirty(store, candidate.id);

    store.getState().restoreSnapshot(snapshotId);
    expectAllFormatsClean(store, candidate.id);
  });

  /**
   * @description Undo MUST restore the prior dirty state rather than
   * force-flipping. The temporal middleware partializes the document;
   * whatever was true/false at that history point is the truth after
   * undo.
   */
  it('undo restores the prior dirty state without additional flips', () => {
    const { store, elementId } = storeWithDirtyCandidate();

    store.getState().commitElementUpdate(elementId, { width: 200 });
    expectAllFormatsDirty(store, elementId);

    store.getState().undo();
    expectAllFormatsClean(store, elementId);
  });

  /**
   * @description A single call to an element-mutating action on one
   * element MUST NOT flip dirty on any other element. Dirty is
   * strictly per-element.
   */
  it('leaves other elements clean when mutating one element', () => {
    const target = makeDirtyCandidate();
    const other = makeDirtyCandidate();
    const store = storeWithElements(target, other);

    store.getState().updateElementStyle(target.id, { opacity: 0.5 });

    expectAllFormatsDirty(store, target.id);
    expectAllFormatsClean(store, other.id);
  });
});

function makeDirtyCandidate(overrides: Parameters<typeof makeElement>[0] = {}): BroadsetElement {
  return makeElement({
    ...overrides,
    extensions: {
      psd: { dirty: false },
      pdf: { dirty: false },
      pptx: { dirty: false },
      svg: { dirty: false },
      ...(overrides.extensions ?? {}),
    },
  });
}

function storeWithDirtyCandidate(): { store: ReturnType<typeof createEditorStore>; elementId: string } {
  const element = makeDirtyCandidate();
  const store = storeWithElements(element);

  return { store, elementId: element.id };
}

function getFormatExtension(
  element: BroadsetElement,
  formatId: BroadsetFormatId,
): Record<string, unknown> | undefined {
  const value = element.extensions[formatId];

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function expectAllFormatsDirty(store: ReturnType<typeof createEditorStore>, elementId: string): void {
  const element = findElement(store, elementId);

  expect(element).toBeDefined();

  if (element === undefined) {
    return;
  }

  for (const formatId of BROADSET_FORMAT_IDS) {
    const extension = getFormatExtension(element, formatId);

    expect(extension, `expected extensions.${formatId} to be present`).toBeDefined();
    expect(extension?.['dirty'], `expected extensions.${formatId}.dirty to be true`).toBe(true);
  }
}

function expectAllFormatsClean(store: ReturnType<typeof createEditorStore>, elementId: string): void {
  const element = findElement(store, elementId);

  expect(element).toBeDefined();

  if (element === undefined) {
    return;
  }

  for (const formatId of BROADSET_FORMAT_IDS) {
    const extension = getFormatExtension(element, formatId);

    expect(extension, `expected extensions.${formatId} to be present`).toBeDefined();
    expect(extension?.['dirty'], `expected extensions.${formatId}.dirty to be false`).toBe(false);
  }
}

