import { describe, expect, it } from 'vitest';

import { resolveTimelinePreviewState } from './v1-demo-workspace-helpers';

describe('resolveTimelinePreviewState', () => {
  /**
   * @description Scrubbing the ruler takes precedence over the underlying playback-playing flag:
   * while a scrub is in progress the preview label must read "Scrubbing" regardless of whether
   * playback was playing or paused when the scrub started.
   */
  it('reports scrubbing while a scrub is in progress, regardless of the playing flag', () => {
    expect(resolveTimelinePreviewState({ scrubbing: true, playing: true })).toBe('scrubbing');
    expect(resolveTimelinePreviewState({ scrubbing: true, playing: false })).toBe('scrubbing');
  });

  it('falls through to playing/paused once scrubbing has ended', () => {
    expect(resolveTimelinePreviewState({ scrubbing: false, playing: true })).toBe('playing');
    expect(resolveTimelinePreviewState({ scrubbing: false, playing: false })).toBe('paused');
  });
});
