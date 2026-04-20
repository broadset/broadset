import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
  type ElementOverrides,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { startPathDrawing, startPathEditing, startPlacement } from './editing';
import {
  commitInlineText,
  detectBold,
  detectItalic,
  detectUnderline,
  startInlineTextEditing,
  stopInlineTextEditing,
  unwrapFormatting,
  wrapWithFormatting,
} from './inline-text';
import { createEditorStore } from './store-actions';

type ElementFactoryOverrides = ElementOverrides & {
  readonly type?: string;
};

function makeElement(overrides: ElementFactoryOverrides = {}): BroadsetElement {
  return createDefaultElement(overrides.type ?? 'rectangle', overrides);
}

function makeDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    elements,
  };
}

function storeWithElements(...elements: readonly BroadsetElement[]) {
  const store = createEditorStore();

  store.getState().setDocument(makeDocument(elements));

  return store;
}

describe('startInlineTextEditing', () => {
  /** @description Double-click on a text element must enter inline editing mode. The editingMode should reflect the inline-text state with the correct element id. */
  it('enters inline text editing mode for a text element', () => {
    const text = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(text);

    store.getState().selectElement(text.id);
    startInlineTextEditing(store, text.id);

    const state = store.getState();

    expect(state.editingMode).toEqual({ type: 'inline-text', elementId: text.id });
    expect(state.inlineTextEditingElementId).toBe(text.id);
    expect(state.activeElementIds).toContain(text.id);
  });

  /** @description Only text elements are allowed to enter inline editing — attempting to inline-edit a rectangle must be a no-op. */
  it('rejects non-text elements', () => {
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(rect);

    store.getState().selectElement(rect.id);
    startInlineTextEditing(store, rect.id);

    const state = store.getState();

    expect(state.editingMode).toEqual({ type: 'none' });
    expect(state.inlineTextEditingElementId).toBeNull();
  });

  /** @description Attempting to inline-edit an element that doesn't exist in the document must be a no-op. */
  it('rejects elements not in the document', () => {
    const store = createEditorStore();

    startInlineTextEditing(store, 'nonexistent');

    expect(store.getState().editingMode).toEqual({ type: 'none' });
    expect(store.getState().inlineTextEditingElementId).toBeNull();
  });

  /** @description Entering inline text editing must clear any active path editing mode — only one editing mode at a time. */
  it('exits path editing when entering inline text editing', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const text = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(path, text);

    startPathEditing(store, path.id);
    expect(store.getState().pathEditingElementId).toBe(path.id);

    startInlineTextEditing(store, text.id);

    const state = store.getState();

    expect(state.pathEditingElementId).toBeNull();
    expect(state.pathDrawingElementId).toBeNull();
    expect(state.pendingPlacementType).toBeNull();
    expect(state.editingMode).toEqual({ type: 'inline-text', elementId: text.id });
  });

  /** @description Entering inline text editing must clear any active path drawing mode. */
  it('exits path drawing when entering inline text editing', () => {
    const path = makeElement({ type: 'path', content: '' });
    const text = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(path, text);

    startPathDrawing(store, path.id);
    expect(store.getState().pathDrawingElementId).toBe(path.id);

    startInlineTextEditing(store, text.id);

    expect(store.getState().pathDrawingElementId).toBeNull();
    expect(store.getState().editingMode).toEqual({ type: 'inline-text', elementId: text.id });
  });

  /** @description Entering inline text editing must cancel any pending placement. */
  it('cancels placement when entering inline text editing', () => {
    const text = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(text);

    startPlacement(store, 'rectangle');
    expect(store.getState().pendingPlacementType).toBe('rectangle');

    startInlineTextEditing(store, text.id);

    expect(store.getState().pendingPlacementType).toBeNull();
    expect(store.getState().editingMode).toEqual({ type: 'inline-text', elementId: text.id });
  });

  /** @description The element being inline-edited must be selected as the sole active element. */
  it('selects the element as the sole active element', () => {
    const text1 = makeElement({ type: 'text', content: 'First' });
    const text2 = makeElement({ type: 'text', content: 'Second' });
    const store = storeWithElements(text1, text2);

    store.getState().setActiveElements([text1.id, text2.id]);
    startInlineTextEditing(store, text2.id);

    expect(store.getState().activeElementIds).toEqual([text2.id]);
  });
});

describe('stopInlineTextEditing', () => {
  /** @description Exiting inline text editing must return the editing mode to 'none' and clear the inline editing element id. */
  it('exits inline text editing mode', () => {
    const text = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(text);

    startInlineTextEditing(store, text.id);
    expect(store.getState().editingMode.type).toBe('inline-text');

    stopInlineTextEditing(store);

    const state = store.getState();

    expect(state.editingMode).toEqual({ type: 'none' });
    expect(state.inlineTextEditingElementId).toBeNull();
  });

  /** @description Stopping inline text editing when not active must be a safe no-op. */
  it('is a no-op when inline text editing is not active', () => {
    const store = createEditorStore();

    stopInlineTextEditing(store);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });

  /** @description The previously-edited element must remain selected after exiting inline editing. */
  it('preserves the selected element after exiting', () => {
    const text = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(text);

    startInlineTextEditing(store, text.id);
    stopInlineTextEditing(store);

    expect(store.getState().activeElementIds).toContain(text.id);
  });
});

describe('commitInlineText', () => {
  /** @description Committing text content from the contenteditable overlay must update the element's content in the store. */
  it('updates the element content in the store', () => {
    const text = makeElement({ type: 'text', content: 'Original' });
    const store = storeWithElements(text);

    startInlineTextEditing(store, text.id);
    commitInlineText(store, text.id, 'Updated content');

    const updated = store.getState().document.elements.find((element) => element.id === text.id);

    expect(updated?.content).toBe('Updated content');
  });

  /** @description Committing sanitizes HTML content through the model's sanitizeTextContent before storing. */
  it('sanitizes HTML content before storing', () => {
    const text = makeElement({ type: 'text', content: 'Original' });
    const store = storeWithElements(text);

    startInlineTextEditing(store, text.id);
    commitInlineText(store, text.id, 'Hello <strong>bold</strong> <script>alert("xss")</script> world');

    const updated = store.getState().document.elements.find((element) => element.id === text.id);

    expect(updated?.content).toBe('Hello <strong>bold</strong>  world');
    expect(updated?.content).not.toContain('script');
  });

  /** @description Committing for a non-existent element must be a no-op. */
  it('is a no-op for non-existent elements', () => {
    const store = createEditorStore();
    const elementsBefore = store.getState().document.elements;

    commitInlineText(store, 'nonexistent', 'content');

    expect(store.getState().document.elements).toBe(elementsBefore);
  });

  /** @description Rich text content with allowed tags (strong, em, u, span, br) must be preserved through commit. */
  it('preserves allowed rich text tags', () => {
    const text = makeElement({ type: 'text', content: 'Original' });
    const store = storeWithElements(text);

    const richContent =
      '<strong>Bold</strong> and <em>italic</em> and <u>underline</u><br><span style="color: red">red</span>';

    startInlineTextEditing(store, text.id);
    commitInlineText(store, text.id, richContent);

    const updated = store.getState().document.elements.find((element) => element.id === text.id);

    expect(updated?.content).toContain('<strong>');
    expect(updated?.content).toContain('<em>');
    expect(updated?.content).toContain('<u>');
    expect(updated?.content).toContain('<br>');
    expect(updated?.content).toContain('<span');
  });
});

describe('selection change exits inline editing', () => {
  /** @description Selecting a different element while inline editing is active must auto-exit inline editing mode. */
  it('exits inline editing when a different element is selected', () => {
    const text = makeElement({ type: 'text', content: 'Hello' });
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(text, rect);

    startInlineTextEditing(store, text.id);
    expect(store.getState().editingMode.type).toBe('inline-text');

    store.getState().selectElement(rect.id);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
    expect(store.getState().inlineTextEditingElementId).toBeNull();
  });

  /** @description Deselecting all elements while inline editing is active must auto-exit inline editing mode. */
  it('exits inline editing when selection is cleared', () => {
    const text = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(text);

    startInlineTextEditing(store, text.id);
    store.getState().selectElement(null);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
    expect(store.getState().inlineTextEditingElementId).toBeNull();
  });

  /** @description Re-selecting the same element must not exit inline editing mode. */
  it('does not exit inline editing when the same element stays selected', () => {
    const text = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(text);

    startInlineTextEditing(store, text.id);
    store.getState().selectElement(text.id);

    expect(store.getState().editingMode.type).toBe('inline-text');
    expect(store.getState().inlineTextEditingElementId).toBe(text.id);
  });
});

describe('mutex with other editing modes', () => {
  /** @description Starting path editing while inline text editing is active must exit inline text editing. */
  it('entering path editing exits inline text editing', () => {
    const text = makeElement({ type: 'text', content: 'Hello' });
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const store = storeWithElements(text, path);

    startInlineTextEditing(store, text.id);
    expect(store.getState().editingMode.type).toBe('inline-text');

    startPathEditing(store, path.id);

    expect(store.getState().editingMode.type).toBe('path-editing');
    expect(store.getState().inlineTextEditingElementId).toBeNull();
  });

  /** @description Starting placement while inline text editing is active must exit inline text editing. */
  it('entering placement exits inline text editing', () => {
    const text = makeElement({ type: 'text', content: 'Hello' });
    const store = storeWithElements(text);

    startInlineTextEditing(store, text.id);
    expect(store.getState().editingMode.type).toBe('inline-text');

    startPlacement(store, 'rectangle');

    expect(store.getState().editingMode.type).toBe('placement');
    expect(store.getState().inlineTextEditingElementId).toBeNull();
  });
});

describe('wrapWithFormatting', () => {
  /** @description Bold formatting must wrap the given HTML string in strong tags per the spec's formatting table. */
  it('wraps text with strong tags for bold', () => {
    expect(wrapWithFormatting('hello', 'bold')).toBe('<strong>hello</strong>');
  });

  /** @description Italic formatting must wrap in em tags. */
  it('wraps text with em tags for italic', () => {
    expect(wrapWithFormatting('hello', 'italic')).toBe('<em>hello</em>');
  });

  /** @description Underline formatting must wrap in u tags. */
  it('wraps text with u tags for underline', () => {
    expect(wrapWithFormatting('hello', 'underline')).toBe('<u>hello</u>');
  });

  /** @description Color formatting must wrap in a span with inline color style. */
  it('wraps text with span color style', () => {
    expect(wrapWithFormatting('hello', 'color', '#ff0000')).toBe('<span style="color: #ff0000">hello</span>');
  });

  /** @description Font size formatting must wrap in a span with inline font-size style. */
  it('wraps text with span font-size style', () => {
    expect(wrapWithFormatting('hello', 'fontSize', '16px')).toBe('<span style="font-size: 16px">hello</span>');
  });

  /** @description Wrapping already-formatted text must nest the tags correctly. */
  it('nests tags when wrapping already-formatted text', () => {
    const boldText = '<strong>hello</strong>';

    expect(wrapWithFormatting(boldText, 'italic')).toBe('<em><strong>hello</strong></em>');
  });
});

describe('unwrapFormatting', () => {
  /** @description Unwrapping bold must remove the outermost strong tags. */
  it('removes strong tags for bold', () => {
    expect(unwrapFormatting('<strong>hello</strong>', 'bold')).toBe('hello');
  });

  /** @description Unwrapping italic must remove em tags. */
  it('removes em tags for italic', () => {
    expect(unwrapFormatting('<em>hello</em>', 'italic')).toBe('hello');
  });

  /** @description Unwrapping underline must remove u tags. */
  it('removes u tags for underline', () => {
    expect(unwrapFormatting('<u>hello</u>', 'underline')).toBe('hello');
  });

  /** @description Unwrapping must handle nested formatting by only removing the target tags. */
  it('only removes the target tag, preserving inner formatting', () => {
    expect(unwrapFormatting('<strong><em>hello</em></strong>', 'bold')).toBe('<em>hello</em>');
  });

  /** @description Unwrapping text that doesn't have the formatting must return it unchanged. */
  it('returns unchanged text when formatting is not present', () => {
    expect(unwrapFormatting('hello', 'bold')).toBe('hello');
  });

  /** @description Unwrapping must handle multiple occurrences of the same tag within the string. */
  it('removes all occurrences of the target tag', () => {
    expect(unwrapFormatting('<strong>hello</strong> and <strong>world</strong>', 'bold')).toBe('hello and world');
  });

  /** @description Unwrapping color must remove the color span and extract its content. */
  it('unwraps color span formatting', () => {
    expect(unwrapFormatting('<span style="color: #ff0000">hello</span>', 'color')).toBe('hello');
  });

  /** @description Unwrapping fontSize must remove the font-size span and extract its content. */
  it('unwraps fontSize span formatting', () => {
    expect(unwrapFormatting('<span style="font-size: 16px">hello</span>', 'fontSize')).toBe('hello');
  });

  /** @description Unwrapping color from nested spans must not strip unrelated closing span tags. */
  it('does not break nested spans when unwrapping color', () => {
    expect(unwrapFormatting('<span style="font-size: 20px"><span style="color: red">text</span></span>', 'color')).toBe(
      '<span style="font-size: 20px">text</span>',
    );
  });

  /** @description Unwrapping fontSize from nested spans must not strip unrelated closing span tags. */
  it('does not break nested spans when unwrapping fontSize', () => {
    expect(
      unwrapFormatting('<span style="color: red"><span style="font-size: 20px">text</span></span>', 'fontSize'),
    ).toBe('<span style="color: red">text</span>');
  });

  /** @description Unwrapping must handle spans where style is not the first attribute. */
  it('unwraps color from span with preceding attributes', () => {
    expect(unwrapFormatting('<span class="x" style="color: red">text</span>', 'color')).toBe('text');
  });
});

describe('detectBold', () => {
  /** @description Detecting bold must return true when the text is wrapped in strong or b tags. */
  it('detects strong tags', () => {
    expect(detectBold('<strong>hello</strong>')).toBe(true);
  });

  it('detects b tags', () => {
    expect(detectBold('<b>hello</b>')).toBe(true);
  });

  it('returns false for non-bold text', () => {
    expect(detectBold('hello')).toBe(false);
  });

  it('returns false for partially bold text', () => {
    expect(detectBold('<strong>hello</strong> world')).toBe(false);
  });
});

describe('detectItalic', () => {
  /** @description Detecting italic must return true when the text is wrapped in em or i tags. */
  it('detects em tags', () => {
    expect(detectItalic('<em>hello</em>')).toBe(true);
  });

  it('detects i tags', () => {
    expect(detectItalic('<i>hello</i>')).toBe(true);
  });

  it('returns false for non-italic text', () => {
    expect(detectItalic('hello')).toBe(false);
  });
});

describe('detectUnderline', () => {
  /** @description Detecting underline must return true when the text is wrapped in u tags. */
  it('detects u tags', () => {
    expect(detectUnderline('<u>hello</u>')).toBe(true);
  });

  it('returns false for non-underlined text', () => {
    expect(detectUnderline('hello')).toBe(false);
  });
});
