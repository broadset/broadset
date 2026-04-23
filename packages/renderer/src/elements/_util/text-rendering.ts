import { sanitizeTextContent } from '@broadset/model';

const BR_TAG_RE = /<br\s*\/?>/giu;

/**
 * Parses sanitized rich-text markup into a detached DocumentFragment via
 * `DOMParser` so callers never mount untrusted markup via `innerHTML` on
 * a live document node. `<br>` is normalized to a newline character so
 * `textContent` readers see line-break intent. Consumers iterating DOM
 * nodes that need real `<br>` elements (semantic mode) should use
 * {@link parseSanitizedTextFragmentSemantic} instead.
 */
export function parseSanitizedTextFragment(content: string): DocumentFragment {
  return parseFragment(sanitizeTextContent(content).replace(BR_TAG_RE, '\n'));
}

/**
 * Parses sanitized rich-text markup into a detached DocumentFragment
 * while preserving `<br>` as real DOM nodes. Used by the semantic text
 * renderer so accessibility tools and exporters see structured line
 * breaks instead of collapsed whitespace.
 */
export function parseSanitizedTextFragmentSemantic(content: string): DocumentFragment {
  return parseFragment(sanitizeTextContent(content));
}

function parseFragment(sanitized: string): DocumentFragment {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!DOCTYPE html><body>${sanitized}</body>`, 'text/html');
  const fragment = document.createDocumentFragment();

  for (const node of Array.from(doc.body.childNodes)) {
    fragment.appendChild(node);
  }

  return fragment;
}

/**
 * Converts sanitized rich-text markup into plain text while preserving
 * `<br>` linebreak intent. Uses the DOMParser-based fragment so no live
 * DOM node receives untrusted markup via `innerHTML`.
 */
export function toPlainText(content: string): string {
  const fragment = parseSanitizedTextFragment(content);

  return fragment.textContent;
}

/**
 * Splits a text string into per-character `<span>` nodes for animation
 * instrumentation. Each span carries a stable `data-char-index` so playback
 * decorators can target individual characters without holding direct node
 * references.
 */
export function renderPerCharacterSpans(host: HTMLElement, content: string): void {
  const plainText = toPlainText(content);

  host.textContent = '';

  for (let i = 0; i < plainText.length; i += 1) {
    const span = document.createElement('span');

    span.setAttribute('data-char-index', String(i));
    // Preserve visible spacing for single-space spans in per-character
    // text rendering. Without this, whitespace-only characters collapse
    // under normal white-space handling and produce a zero-width glyph.
    span.style.whiteSpace = 'pre';
    span.textContent = plainText.charAt(i);
    host.appendChild(span);
  }
}
