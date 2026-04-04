// ---------------------------------------------------------------------------
// Animation setup — creates a PlaybackController for a sample document
// ---------------------------------------------------------------------------

import type { BroadsetDocument } from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';
import { createPlaybackController, escapeCssId, resolveStateTimeline } from '@broadset/playback';
import { DATA_ELEMENT_ID } from '@broadset/renderer';

/**
 * Create a PlaybackController for all animated elements in the document.
 * Attaches each element and seeks its IN timeline to t=0 so the initial
 * frame is visible without triggering a full playback.
 */
export function createDemoController(doc: BroadsetDocument, host: HTMLElement): PlaybackController {
  const controller = createPlaybackController(doc.animationRegistry);

  for (const entry of doc.animationRegistry) {
    const selector = `[${DATA_ELEMENT_ID}="${escapeCssId(entry.elementId)}"]`;
    const container = host.querySelector<HTMLElement>(selector);

    if (!container) continue;

    controller.attach(container, entry.elementId);

    // Seek the IN timeline to t=0 for the initial frame
    const inTimeline = resolveStateTimeline(entry.config, 'IN');

    if (inTimeline) {
      const timelineName = inTimeline.name || inTimeline.id;

      controller.seekTimeline(entry.elementId, timelineName, 0);
    }
  }

  return controller;
}
