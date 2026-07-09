/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { createDocument, createElement } from '../screen-renderer/test-helpers';
import { createQrCodeMarkupAsElement } from './_util/qr-markup';
import { parseSanitizedTextFragment } from './_util/text-rendering';
import { createSemanticTextRenderer } from './text-semantic';

describe('P3.3 — safe builders remove innerHTML paths', () => {
  /**
   * @description QR markup must be available as a parsed SVG element, not
   *   as a raw markup string that callers must assign via innerHTML.
   *   Using a parsed element keeps the path off of `innerHTML` entirely so
   *   every code path that mounts QR content benefits from DOM parser
   *   validation of the markup shape.
   */
  it('produces QR output as a parsed <svg> element', () => {
    const svg = createQrCodeMarkupAsElement('https://broadset.dev');

    expect(svg).not.toBeNull();
    expect(svg?.tagName.toLowerCase()).toBe('svg');
  });

  /**
   * @description Empty QR payloads return null so callers can distinguish
   *   "no QR requested" from "generation failed". This mirrors the
   *   existing string-returning `createQrCodeMarkup` contract.
   */
  it('returns null for empty QR payload via the element API', () => {
    expect(createQrCodeMarkupAsElement('')).toBeNull();
  });

  /**
   * @description Rich text sanitization + entity decoding for the
   *   plain-text path must go through a DOMParser-produced fragment, not
   *   through `container.innerHTML = …` on a live DOM element. The
   *   resulting textContent preserves `<br>` as newline intent while
   *   stripping other markup.
   */
  it('decodes text entities without assigning to innerHTML', () => {
    const fragment = parseSanitizedTextFragment('<b>Hi</b> &amp; hi<br/>line 2');

    expect(fragment.textContent).toBe('Hi & hi\nline 2');
  });
});

describe('P3.3 — semantic text renderer preserves allowed tags', () => {
  /**
   * @description In semantic mode, allowed formatting tags (`<b>`, `<i>`,
   *   `<u>`, `<strong>`, `<em>`, `<span>`, `<br>`) are preserved as real
   *   DOM nodes so screen readers and exporters see structured markup
   *   rather than a flat per-character span soup.
   */
  it('mounts semantic <b>/<i>/<br> as DOM nodes', () => {
    const host = document.createElement('div');
    const element = createElement({
      id: 'txt',
      type: 'text',
      content: 'Hello <b>world</b><br/><i>again</i>',
    });
    const doc = createDocument([element]);
    const instance = createSemanticTextRenderer({ element, host, document: doc });

    expect(host.querySelector('b')?.textContent).toBe('world');
    expect(host.querySelector('i')?.textContent).toBe('again');
    expect(host.querySelector('br')).not.toBeNull();

    instance.destroy();
  });

  /**
   * @description Script tags and unknown tags must not appear in the
   *   semantic output. Defense-in-depth sanitization runs even when the
   *   caller has their own trust boundary.
   */
  it('strips <script> and other forbidden tags even in semantic mode', () => {
    const host = document.createElement('div');
    const element = createElement({
      id: 'txt',
      type: 'text',
      content: 'ok <script>alert(1)</script><b>bold</b>',
    });
    const doc = createDocument([element]);
    const instance = createSemanticTextRenderer({ element, host, document: doc });

    expect(host.querySelector('script')).toBeNull();
    expect(host.textContent).not.toContain('alert');
    expect(host.querySelector('b')?.textContent).toBe('bold');

    instance.destroy();
  });
});
