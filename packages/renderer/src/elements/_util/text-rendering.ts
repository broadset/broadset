import { sanitizeTextContent } from '@broadset/model';

const BR_TAG_RE = /<br\s*\/?>/giu;

/**
 * Converts sanitized rich-text markup into plain text while preserving
 * `<br>` linebreak intent. DOM parsing handles entity decoding so callers
 * never materialize untrusted markup via `innerHTML` in a live document.
 */
export function toPlainText(content: string): string {
  const sanitized = sanitizeTextContent(content);
  const container = document.createElement('div');

  container.innerHTML = sanitized.replace(BR_TAG_RE, '\n');

  return container.textContent;
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
