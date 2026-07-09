import { resolveContentAsPlainString } from '@broadset/model';

import { mapTextAlignment } from './_util/alignment';
import { createSimpleRenderer } from './_util/simple-renderer';

const DEFAULT_CLOCK_DISPLAY = '00:00:00';

/**
 * Clock renderer (static-text variant). Emits the element content verbatim
 * centered vertically with the configured text alignment. Time-driven
 * updates for realtime / countdown / stopwatch modes land in Phase 3.4
 * runtime services — until then, the renderer shows the literal content
 * string or a zero placeholder when content is empty.
 */
export const createClockRenderer = createSimpleRenderer((host, element) => {
  const contentText = resolveContentAsPlainString(element.content);

  host.textContent = contentText === '' ? DEFAULT_CLOCK_DISPLAY : contentText;
  host.style.display = 'flex';
  host.style.alignItems = 'center';
  host.style.justifyContent = mapTextAlignment(element.style.textAlignment);
});
