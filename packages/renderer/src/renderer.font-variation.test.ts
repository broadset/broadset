/** @jest-environment jsdom */

import { createScreenRenderer, DATA_ATTRIBUTES } from './index';
import { createDocument, createElement } from './renderer-test-helpers';

/** @description The renderer must apply font-variation-settings CSS when the style field is set. */
describe('font-variation-settings', () => {
  /** @description When fontVariationSettings is set on a text element, the CSS property is applied. */
  it('applies font-variation-settings CSS from style', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([
        createElement({
          id: 'txt-var',
          type: 'text',
          content: 'Variable',
          style: { fontVariationSettings: "'wght' 600, 'wdth' 80", opacity: 1 },
        }),
      ]),
    });

    const contentNode = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementContent}]`);

    expect(contentNode?.style.fontVariationSettings).toBe("'wght' 600, 'wdth' 80");

    controller.destroy();
  });

  /** @description When fontVariationSettings is not set, the CSS property is empty. */
  it('omits font-variation-settings CSS when not set', () => {
    const host = document.createElement('div');

    host.style.width = '1280px';
    host.style.height = '720px';

    const controller = createScreenRenderer({
      host,
      document: createDocument([createElement({ id: 'txt-plain', type: 'text', content: 'Plain' })]),
    });

    const contentNode = host.querySelector<HTMLElement>(`[${DATA_ATTRIBUTES.elementContent}]`);

    expect(contentNode?.style.fontVariationSettings).toBe('');

    controller.destroy();
  });
});
