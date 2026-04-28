import { resolveContentAsPlainString } from '@broadset/model';

import { createSimpleRenderer } from './_util/simple-renderer';

const ITEM_SEPARATOR = '   •   ';

/**
 * Flattens a ticker JSON array (e.g. `["Breaking","Sports"]`) into a
 * bullet-separated string. Falls back to the original content when the
 * payload is not a JSON array of strings.
 */
function formatTickerText(content: string): string {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed.join(ITEM_SEPARATOR);
    }
  } catch {
    // Fall back to the original string.
  }

  return content;
}

/**
 * Ticker renderer (static variant). Emits the element content as a single
 * clipped, horizontally laid-out text run. The animated infinite-scroll
 * behavior described in the renderer spec lands in Phase 3.4 runtime
 * services; this renderer is responsible only for the static layout.
 */
export const createTickerRenderer = createSimpleRenderer((host, element) => {
  host.textContent = formatTickerText(resolveContentAsPlainString(element.content));
  host.style.display = 'flex';
  host.style.alignItems = 'center';
  host.style.justifyContent = 'flex-start';
  host.style.paddingLeft = '16px';
  host.style.paddingRight = '16px';
  host.style.textOverflow = 'ellipsis';
  host.style.overflow = 'hidden';
});
