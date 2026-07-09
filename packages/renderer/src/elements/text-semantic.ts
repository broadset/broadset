import { resolveContentAsPlainString } from '@broadset/model';

import { mapTextAlignment, mapVerticalAlignment } from './_util/alignment';
import { createSimpleRenderer } from './_util/simple-renderer';
import { parseSanitizedTextFragmentSemantic } from './_util/text-rendering';

/**
 * Semantic text renderer. Mounts sanitized rich text as structured DOM
 * nodes (`<b>`, `<i>`, `<u>`, `<strong>`, `<em>`, `<span>`, `<br>`) rather
 * than splitting characters into instrumentation spans. Used when the
 * element does not require per-character animation — accessibility tools
 * and exporters see real markup instead of a flat span soup.
 *
 * Sanitization goes through the DOMParser-based text parser, not
 * `innerHTML`, so no untrusted markup reaches live DOM.
 */
export const createSemanticTextRenderer = createSimpleRenderer((host, element) => {
  const fragment = parseSanitizedTextFragmentSemantic(resolveContentAsPlainString(element.content));

  host.replaceChildren(fragment);
  host.style.display = 'flex';
  host.style.flexWrap = 'wrap';
  host.style.alignItems = mapVerticalAlignment(element.style.verticalAlignment);
  host.style.alignContent = mapVerticalAlignment(element.style.verticalAlignment);
  host.style.justifyContent = mapTextAlignment(element.style.textAlignment);
  host.style.wordBreak = 'break-word';
});
