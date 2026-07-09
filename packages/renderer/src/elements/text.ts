import type { BroadsetElement } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';

import type { ElementRendererFactory } from '../core/contracts';
import { substituteDynamicTokens } from '../core/runtime';
import { mapTextAlignment, mapVerticalAlignment } from './_util/alignment';
import { renderPerCharacterSpans } from './_util/text-rendering';

function applyLayout(host: HTMLElement, element: BroadsetElement): void {
  host.style.display = 'flex';
  host.style.flexWrap = 'wrap';
  host.style.alignItems = mapVerticalAlignment(element.style.verticalAlignment);
  host.style.alignContent = mapVerticalAlignment(element.style.verticalAlignment);
  host.style.justifyContent = mapTextAlignment(element.style.textAlignment);
  host.style.wordBreak = 'break-word';
}

/**
 * Text renderer. Splits the resolved plain text into per-character spans
 * for animation instrumentation, then lays them out with flex-wrap so
 * lines flow under the element width while horizontal/vertical alignment
 * honor the element style.
 *
 * When `runtime.data` is provided, `{{key}}` tokens in the element
 * content are substituted against the data service per render — runtime
 * data changes that trigger a document refresh resolve with fresh values
 * without having to mutate the element itself. When `runtime.fonts` is
 * provided, the element's `fontFamily` is handed to the font service for
 * idempotent loading.
 */
export const createTextRenderer: ElementRendererFactory = ({ element, host, runtime }) => {
  function render(nextElement: BroadsetElement): void {
    const raw = resolveContentAsPlainString(nextElement.content);
    const substituted = substituteDynamicTokens(raw, runtime?.data);

    renderPerCharacterSpans(host, substituted);
    applyLayout(host, nextElement);

    const fontFamily = nextElement.style.fontFamily;

    if (runtime?.fonts !== undefined && fontFamily !== undefined && fontFamily.trim() !== '') {
      void runtime.fonts.ensureLoaded(fontFamily, nextElement.style.fontWeight, nextElement.style.fontStyle);
    }
  }

  render(element);

  return {
    update(nextElement) {
      render(nextElement);
    },
    destroy() {
      host.replaceChildren();
      host.textContent = '';
    },
  };
};
