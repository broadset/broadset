import { resolveContentAsPlainString } from '@broadset/model';

import { renderMediaPlaceholder } from './_util/media-placeholder';
import { createSimpleRenderer } from './_util/simple-renderer';

/**
 * Image renderer with a two-phase load strategy for export compatibility:
 *
 *   1. Try with `crossOrigin="anonymous"` so the browser issues a CORS
 *      request. When the server responds with CORS headers (most major
 *      image CDNs do), the `<img>` is non-tainted AND the same URL is
 *      reusable by video/raster exporters from the HTTP cache.
 *   2. If that fails (CORS rejection or network error), fall back to a
 *      plain `<img>` so the image still displays in the editor — exports
 *      of that image will show a placeholder instead.
 *   3. If both attempts error, swap in the broken-image placeholder.
 */
export const createImageRenderer = createSimpleRenderer((host, element) => {
  const contentText = resolveContentAsPlainString(element.content);

  if (contentText.trim() === '') {
    renderMediaPlaceholder(host, element, 'image');

    return;
  }

  const applyStyle = (node: HTMLImageElement): void => {
    node.alt = element.name;
    node.style.width = '100%';
    node.style.height = '100%';
    node.style.display = 'block';
    node.style.objectFit = element.style.objectFit ?? 'cover';
  };

  const corsImage = document.createElement('img');

  corsImage.crossOrigin = 'anonymous';
  applyStyle(corsImage);

  corsImage.addEventListener('error', () => {
    const fallbackImage = document.createElement('img');

    applyStyle(fallbackImage);
    fallbackImage.src = contentText;
    fallbackImage.addEventListener('error', () => {
      renderMediaPlaceholder(host, element, 'image');
    });
    host.replaceChildren(fallbackImage);
  });

  corsImage.src = contentText;
  host.replaceChildren(corsImage);
});
