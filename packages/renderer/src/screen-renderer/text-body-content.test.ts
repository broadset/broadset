/** @vitest-environment jsdom */

import { paragraph, run, textBody } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createScreenRenderer, DATA_ATTRIBUTES } from '../index';
import { createDocument, createElement } from './test-helpers';

/**
 * Phase 1 unit #9c — verifies the renderer accepts a TextBody payload on
 * `element.content` end-to-end and emits the flattened text via the
 * existing per-character span path. Other fixtures remain on the flat
 * `string` form; this test is the one canonical multi-paragraph demo.
 */
describe('TextBody-backed text element', () => {
  it('renders a multi-paragraph TextBody as flattened per-character spans', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const body = textBody([paragraph([run('Hello'), run(' world')]), paragraph([run('Line two')])]);

    const controller = createScreenRenderer({
      host,
      document: createDocument([
        createElement({
          id: 'text-rich',
          type: 'text',
          content: body,
          width: 400,
          height: 80,
        }),
      ]),
    });

    const elementNode = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementId}="text-rich"]`);
    const contentNode = elementNode?.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementContent}]`);

    expect(contentNode).not.toBeNull();
    expect(contentNode?.textContent).toContain('Hello world');
    expect(contentNode?.textContent).toContain('Line two');

    controller.destroy();
  });

  it('handles an empty TextBody without throwing', () => {
    const host = document.createElement('div');

    host.style.width = '640px';
    host.style.height = '360px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([
        createElement({
          id: 'text-empty',
          type: 'text',
          content: textBody([]),
          width: 200,
          height: 40,
        }),
      ]),
    });

    const elementNode = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementId}="text-empty"]`);
    const contentNode = elementNode?.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementContent}]`);

    expect(contentNode).not.toBeNull();

    controller.destroy();
  });
});
