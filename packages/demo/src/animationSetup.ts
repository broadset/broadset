// ---------------------------------------------------------------------------
// Animation setup — creates PlaybackHandles for a sample document
// ---------------------------------------------------------------------------

import type { BroadsetDocument } from '@broadset/model';
import type { PlaybackHandle } from '@broadset/playback';
import { createPlaybackHandle, escapeCssId } from '@broadset/playback';
import { DATA_ELEMENT_ID } from '@broadset/renderer';

/**
 * Create PlaybackHandles for all elements in the document that have
 * animation registry entries with IN state bindings.
 *
 * For each entry, the first timeline bound to IN state is used.
 * If no IN binding exists, the first timeline in the config is used.
 */
export function createAnimationHandles(doc: BroadsetDocument, host: HTMLElement): readonly PlaybackHandle[] {
  const handles: PlaybackHandle[] = [];

  for (const entry of doc.animationRegistry) {
    const selector = `[${DATA_ELEMENT_ID}="${escapeCssId(entry.elementId)}"]`;
    const container = host.querySelector<HTMLElement>(selector);

    if (!container) continue;

    // Find the IN state timeline, or fall back to the first timeline
    const inBinding = entry.config.stateTimelineBindings.find((b) => b.stateName === 'IN');

    const timeline =
      inBinding ?
        entry.config.timelines.find((tl) => tl.id === inBinding.timelineId || tl.name === inBinding.timelineId)
      : entry.config.timelines[0];

    if (!timeline) continue;

    handles.push(createPlaybackHandle(timeline, container));
  }

  return handles;
}
