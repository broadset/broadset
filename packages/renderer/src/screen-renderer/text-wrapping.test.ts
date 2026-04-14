/** @jest-environment jsdom */

import { createScreenRenderer, DATA_ATTRIBUTES } from '../index';
import { createDocument, createElement } from './test-helpers';

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

    const contentNode = host.querySelector(`[${DATA_ATTRIBUTES.elementContent}]`);
    const charSpans = contentNode?.querySelectorAll('[data-char-index]') ?? [];

    expect(charSpans.length).toBe(2);
    expect(charSpans[0]?.textContent).toBe('H');
    expect(charSpans[0]?.getAttribute('data-char-index')).toBe('0');
    expect(charSpans[1]?.textContent).toBe('i');
    expect(charSpans[1]?.getAttribute('data-char-index')).toBe('1');

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

    const contentNode = host.querySelector(`[${DATA_ATTRIBUTES.elementContent}]`);
    const charSpans = contentNode?.querySelectorAll('[data-char-index]') ?? [];

    expect(charSpans.length).toBe(3);
    expect(charSpans[0]?.textContent).toBe('A');
    expect(charSpans[1]?.textContent).toBe(' ');
    expect(charSpans[2]?.textContent).toBe('B');

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

    const contentNode = host.querySelector(`[${DATA_ATTRIBUTES.elementContent}]`);
    const charSpans = contentNode?.querySelectorAll('[data-char-index]') ?? [];

    expect(charSpans.length).toBe(2);
    expect(charSpans[0]?.textContent).toBe('O');
    expect(charSpans[1]?.textContent).toBe('K');

    controller.destroy();
  });
});
