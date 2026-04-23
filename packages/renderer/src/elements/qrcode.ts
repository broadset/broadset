import { resolveContentAsPlainString } from '@broadset/model';

import { createQrCodeMarkup } from './_util/qr-markup';
import { createSimpleRenderer } from './_util/simple-renderer';

/**
 * QR-code renderer. Generates scalable SVG markup from the element content
 * and applies responsive sizing. Empty payloads render no content instead of
 * an empty QR frame.
 */
export const createQrCodeRenderer = createSimpleRenderer((host, element) => {
  const svgMarkup = createQrCodeMarkup(resolveContentAsPlainString(element.content));

  host.innerHTML = svgMarkup ?? '';

  const firstChild = host.firstElementChild;

  if (!(firstChild instanceof SVGElement)) {
    return;
  }

  firstChild.setAttribute('width', '100%');
  firstChild.setAttribute('height', '100%');
  firstChild.setAttribute('preserveAspectRatio', 'xMidYMid meet');
});
