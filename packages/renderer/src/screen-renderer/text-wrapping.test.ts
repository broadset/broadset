/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { createScreenRenderer, DATA_ATTRIBUTES } from '../index';
import { createDocument, createElement } from './test-helpers';

function characterSpans(host: HTMLElement): readonly HTMLElement[] {
  const contentNode = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementContent}]`);

  if (contentNode === null) return [];

  return Array.from(contentNode.querySelectorAll<HTMLElement>('[data-char-index]'));
}

function spanAt(spans: readonly HTMLElement[], index: number): HTMLElement {
  const span = spans[index];

  if (span === undefined) {
    throw new Error(`Expected character span at index ${String(index)}`);
  }

  return span;
}

function renderedText(spans: readonly HTMLElement[]): string {
  return spans.map((span) => span.textContent).join('');
}

describe('per-character text wrapping', () => {
  /** @description Text elements must wrap each character in a span with data-char-index for animation targeting. */
  it('wraps text content characters in individual spans with data-char-index', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-1', type: 'text', content: 'Hi' })]),
    });

    const charSpans = characterSpans(host);

    expect(charSpans.length).toBe(2);
    expect(spanAt(charSpans, 0).textContent).toBe('H');
    expect(spanAt(charSpans, 0).getAttribute('data-char-index')).toBe('0');
    expect(spanAt(charSpans, 1).textContent).toBe('i');
    expect(spanAt(charSpans, 1).getAttribute('data-char-index')).toBe('1');

    controller.destroy();
  });

  /** @description Spaces in text must also receive their own character span. */
  it('wraps spaces as individual character spans', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-2', type: 'text', content: 'A B' })]),
    });

    const charSpans = characterSpans(host);

    expect(charSpans.length).toBe(3);
    expect(spanAt(charSpans, 0).textContent).toBe('A');
    expect(spanAt(charSpans, 1).textContent).toBe(' ');
    expect(spanAt(charSpans, 1).style.whiteSpace).toBe('pre');
    expect(spanAt(charSpans, 2).textContent).toBe('B');

    controller.destroy();
  });

  /** @description HTML markup in text content must be stripped before per-character wrapping. */
  it('strips HTML tags when wrapping characters', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-3', type: 'text', content: '<b>OK</b>' })]),
    });

    const charSpans = characterSpans(host);

    expect(charSpans.length).toBe(2);
    expect(spanAt(charSpans, 0).textContent).toBe('O');
    expect(spanAt(charSpans, 1).textContent).toBe('K');

    controller.destroy();
  });

  /** @description Consecutive spaces must remain distinct spans so visible spacing is not collapsed. */
  it('preserves consecutive spaces between words', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-4', type: 'text', content: 'A  B' })]),
    });

    const charSpans = characterSpans(host);

    expect(charSpans.length).toBe(4);
    expect(renderedText(charSpans)).toBe('A  B');

    controller.destroy();
  });

  /** @description HTML entities like &nbsp; must decode to their visible character equivalents. */
  it('decodes HTML entities while wrapping characters', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-5', type: 'text', content: 'A&nbsp;B' })]),
    });

    const charSpans = characterSpans(host);

    expect(charSpans.length).toBe(3);
    expect(renderedText(charSpans)).toBe('A\u00A0B');

    controller.destroy();
  });

  /** @description Rich-text line breaks via <br> must map to newline characters in per-character output. */
  it('preserves rich text line breaks from br tags', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-6', type: 'text', content: 'A<br>B' })]),
    });

    const charSpans = characterSpans(host);

    expect(charSpans.length).toBe(3);
    expect(renderedText(charSpans)).toBe('A\nB');

    controller.destroy();
  });
});
