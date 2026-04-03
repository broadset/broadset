// ---------------------------------------------------------------------------
// @broadset/playback — public API
// ---------------------------------------------------------------------------

// Interpolation
export {
  applyEasing,
  interpolateColor,
  interpolateKeyframeProperties,
  interpolatePath,
  interpolateValue,
} from './interpolation';

// Timeline
export type { TimelineFrame } from './timeline';
export { computeElementTimelines, computeTimelineDuration, computeTimelineFrame } from './timeline';

// Class state
export type { ClassState } from './class-state';
export { parseClassState } from './class-state';

// CSS escape
export { escapeCssId } from './css-escape';

// Resolve timeline
export type { ModifierTimelines } from './resolve-timeline';
export { resolveModifierTimelines, resolveStateTimeline } from './resolve-timeline';

// Style writer
export { applyStylesToElement, camelToKebab } from './style-writer';

// Playback handle
export type { PlaybackHandle, PlaybackHandleOptions } from './playback-handle';
export { createPlaybackHandle } from './playback-handle';
