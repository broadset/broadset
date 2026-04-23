import { resolveContentAsPlainString } from '@broadset/model';

import { mapTextAlignment, mapVerticalAlignment } from './_util/alignment';
import { createSimpleRenderer } from './_util/simple-renderer';
import { renderPerCharacterSpans } from './_util/text-rendering';

/**
 * Text renderer. Splits the resolved plain text into per-character spans for
 * animation instrumentation, then lays them out with flex-wrap so lines flow
 * under the element width while horizontal/vertical alignment honor the
 * element style.
 */
export const createTextRenderer = createSimpleRenderer((host, element) => {
  renderPerCharacterSpans(host, resolveContentAsPlainString(element.content));
  // Flex-wrap + matching alignContent lets the per-character spans flow onto
  // multiple lines when they exceed the element width while keeping
  // horizontal (justifyContent) and vertical (alignItems single-line /
  // alignContent multi-line) alignment under the element style's control.
  host.style.display = 'flex';
  host.style.flexWrap = 'wrap';
  host.style.alignItems = mapVerticalAlignment(element.style.verticalAlignment);
  host.style.alignContent = mapVerticalAlignment(element.style.verticalAlignment);
  host.style.justifyContent = mapTextAlignment(element.style.textAlignment);
  host.style.wordBreak = 'break-word';
});
