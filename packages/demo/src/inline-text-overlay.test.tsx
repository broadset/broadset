/** @vitest-environment jsdom */

import { createEditorStore, startInlineTextEditing } from '@broadset/editor';
import { createDefaultElement } from '@broadset/model';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InlineTextOverlay } from './demo-components/inline-text-overlay';

/**
 * @description The inline text overlay sets `dangerouslySetInnerHTML`
 * from the persisted element content. If a hostile importer (PDF /
 * PSD / PPTX / SVG) ever lands attacker-controlled markup on a text
 * element and the user double-clicks to edit, the overlay must NOT
 * inject `<script>` tags or HTML event-handler attributes into the
 * DOM. This is the inline editor's last trust boundary; it MUST
 * sanitize even if the schema and the importer factory both fail.
 */
describe('InlineTextOverlay XSS hardening', () => {
  const hostileSamples = [
    '<script>window.__xss_hit = true;</script>',
    '<img src="x" onerror="window.__xss_hit = true;"/>',
    '<a onclick="window.__xss_hit = true;">click</a>',
  ] as const;

  it.each(hostileSamples)('does not emit script markers for content %s', (hostile) => {
    const overlayRoot = document.body.appendChild(document.createElement('div'));
    const store = createEditorStore();

    act(() => {
      const baseline = createDefaultElement('text', { id: 'hostile-text', content: 'placeholder' });
      const compromised = { ...baseline, content: hostile };

      store.setState({
        document: {
          ...store.getState().document,
          elements: [compromised],
        },
      });
      startInlineTextEditing(store, 'hostile-text');
    });

    const worldElement = store.getState().document.elements[0];

    if (worldElement === undefined) {
      throw new Error('Expected element');
    }

    render(<InlineTextOverlay editorStore={store} overlayRoot={overlayRoot} worldElement={worldElement} />);

    const editor = overlayRoot.querySelector('[data-testid="inline-text-editor"]');

    expect(editor).not.toBeNull();

    const html = editor?.innerHTML ?? '';

    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect((window as unknown as { __xss_hit?: boolean }).__xss_hit).toBeUndefined();

    overlayRoot.remove();
  });

  it('flattens TextBody content to plain string before injecting', () => {
    const overlayRoot = document.body.appendChild(document.createElement('div'));
    const store = createEditorStore();

    act(() => {
      const baseline = createDefaultElement('text', { id: 'rich-text', content: 'placeholder' });
      const richElement = {
        ...baseline,
        content: { paragraphs: [{ runs: [{ text: 'first' }, { text: ' second' }] }] },
      };

      store.setState({
        document: {
          ...store.getState().document,
          elements: [richElement],
        },
      });
      startInlineTextEditing(store, 'rich-text');
    });

    const worldElement = store.getState().document.elements[0];

    if (worldElement === undefined) {
      throw new Error('Expected element');
    }

    render(<InlineTextOverlay editorStore={store} overlayRoot={overlayRoot} worldElement={worldElement} />);

    const editor = overlayRoot.querySelector('[data-testid="inline-text-editor"]');

    expect(editor?.textContent).toBe('first second');
    expect(editor?.innerHTML).not.toContain('[object Object]');

    overlayRoot.remove();
  });
});
