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
