import { sanitizeTextContent } from '@broadset/model';

import type { EditorStore } from './store-actions';

export type FormattingType = 'bold' | 'italic' | 'underline' | 'color' | 'fontSize';

/**
 * Enters inline text editing mode for the given element.
 * Only text elements can be inline-edited. Entering this mode clears all
 * other editing modes (path editing, path drawing, placement) and selects
 * the element as the sole active element.
 */
export function startInlineTextEditing(store: EditorStore, elementId: string): void {
  const state = store.getState();
  const element = state.document.elements.find((candidate) => candidate.id === elementId);

  if (element?.type !== 'text') {
    return;
  }

  store.setState({
    activeElementIds: [elementId],
    pendingPlacementType: null,
    pathEditingElementId: null,
    pathDrawingElementId: null,
    inlineTextEditingElementId: elementId,
    editingMode: { type: 'inline-text', elementId },
  });
}

/**
 * Exits inline text editing mode. The previously-edited element remains
 * selected. This is a safe no-op when inline text editing is not active.
 */
export function stopInlineTextEditing(store: EditorStore): void {
  const state = store.getState();

  if (state.inlineTextEditingElementId === null) {
    return;
  }

  store.setState({
    inlineTextEditingElementId: null,
    editingMode:
      state.pendingPlacementType !== null ? { type: 'placement', elementType: state.pendingPlacementType }
      : state.pathEditingElementId !== null ? { type: 'path-editing', elementId: state.pathEditingElementId }
      : state.pathDrawingElementId !== null ? { type: 'path-drawing', elementId: state.pathDrawingElementId }
      : { type: 'none' },
  });
}

/**
 * Commits text content from the contenteditable overlay to the store.
 * The content is sanitized through the model's sanitizeTextContent before
 * being stored. This is a no-op if the element does not exist.
 */
export function commitInlineText(store: EditorStore, elementId: string, content: string): void {
  const state = store.getState();
  const elementIndex = state.document.elements.findIndex((candidate) => candidate.id === elementId);

  if (elementIndex === -1) {
    return;
  }

  const sanitized = sanitizeTextContent(content);

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((element) =>
        element.id === elementId ? { ...element, content: sanitized } : element,
      ),
    },
  });
}

const FORMAT_TAG_MAP: Readonly<Record<'bold' | 'italic' | 'underline', string>> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
};

/**
 * Wraps the given HTML string with the specified formatting.
 * For bold/italic/underline, wraps with the corresponding tag.
 * For color and fontSize, wraps with a span having the appropriate inline style.
 */
export function wrapWithFormatting(html: string, type: FormattingType, value?: string): string {
  if (type === 'bold' || type === 'italic' || type === 'underline') {
    const tag = FORMAT_TAG_MAP[type];

    return `<${tag}>${html}</${tag}>`;
  }

  if (type === 'color') {
    return `<span style="color: ${value ?? 'inherit'}">${html}</span>`;
  }

  return `<span style="font-size: ${value ?? '16px'}">${html}</span>`;
}

/**
 * Removes the specified formatting from the HTML string.
 * For bold, removes both <strong> and <b> tags.
 * For italic, removes both <em> and <i> tags.
 * For underline, removes <u> tags.
 * For color/fontSize, captures the content between matched span tags
 * to avoid stripping unrelated closing </span> tags.
 */
export function unwrapFormatting(html: string, type: FormattingType): string {
  switch (type) {
    case 'bold':
      return html.replace(/<\/?(?:strong|b)>/gi, '');

    case 'italic':
      return html.replace(/<\/?(?:em|i)>/gi, '');

    case 'underline':
      return html.replace(/<\/?u>/gi, '');

    case 'color':
      return html.replace(/<span\b[^>]*?\bstyle="[^"]*?\bcolor:[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '$1');

    case 'fontSize':
      return html.replace(/<span\b[^>]*?\bstyle="[^"]*?\bfont-size:[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '$1');
  }
}

/**
 * Detects whether the entire HTML string is wrapped in bold formatting
 * (strong or b tags). Returns true only if ALL content is bold.
 */
export function detectBold(html: string): boolean {
  return (
    /^<(?:strong|b)>[\s\S]+<\/(?:strong|b)>$/i.test(html) &&
    !/<\/(?:strong|b)>[\s\S]+/i.test(html.slice(html.indexOf('>') + 1, html.lastIndexOf('</')))
  );
}

/**
 * Detects whether the entire HTML string is wrapped in italic formatting
 * (em or i tags). Returns true only if ALL content is italic.
 */
export function detectItalic(html: string): boolean {
  return (
    /^<(?:em|i)>[\s\S]+<\/(?:em|i)>$/i.test(html) &&
    !/<\/(?:em|i)>[\s\S]+/i.test(html.slice(html.indexOf('>') + 1, html.lastIndexOf('</')))
  );
}

/**
 * Detects whether the entire HTML string is wrapped in underline formatting
 * (u tags). Returns true only if ALL content is underlined.
 */
export function detectUnderline(html: string): boolean {
  return (
    /^<u>[\s\S]+<\/u>$/i.test(html) && !/<\/u>[\s\S]+/i.test(html.slice(html.indexOf('>') + 1, html.lastIndexOf('</')))
  );
}
