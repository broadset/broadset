import { resolveContentAsPlainString } from '@broadset/model';

import { createQrCodeMarkupAsElement } from './_util/qr-markup';
import { createSimpleRenderer } from './_util/simple-renderer';

/**
 * QR-code renderer. Generates scalable SVG output from the element content
 * via the safe element-returning helper, then mounts it directly — no
 * `innerHTML` path. Empty payloads render no content instead of an empty
 * QR frame.
 */
export const createQrCodeRenderer = createSimpleRenderer((host, element) => {
  const svg = createQrCodeMarkupAsElement(resolveContentAsPlainString(element.content));

  if (svg === null) {
    host.replaceChildren();

    return;
  }

  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  host.replaceChildren(svg);
});
