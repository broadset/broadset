import { resolveContentAsPlainString } from '@broadset/model';

import { renderSanitizedSvgInto } from '../screen-renderer/svg-sanitize';
import { createSimpleRenderer } from './_util/simple-renderer';

/**
 * SVG renderer. Parses and sanitizes untrusted SVG markup through the
 * dedicated SVG sanitization boundary so no `<script>`, `<foreignObject>`,
 * event handlers, or unsafe URL schemes reach the DOM. Imposes responsive
 * 100% sizing and `xMidYMid meet` aspect handling to match the element box.
 */
export const createSvgRenderer = createSimpleRenderer((host, element) => {
  const sanitizedRoot = renderSanitizedSvgInto(host, resolveContentAsPlainString(element.content));

  if (sanitizedRoot === null) {
    return;
  }

  sanitizedRoot.setAttribute('width', '100%');
  sanitizedRoot.setAttribute('height', '100%');
  sanitizedRoot.setAttribute('preserveAspectRatio', 'xMidYMid meet');
});
