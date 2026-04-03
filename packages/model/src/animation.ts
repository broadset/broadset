import { z } from 'zod';

// ---------------------------------------------------------------------------
// Interpolation / easing
// ---------------------------------------------------------------------------

const EASING_PRESETS = new Set(['linear', 'ease-in', 'ease-out', 'ease-in-out']);

/**
 * Validates cubic-bezier control points.
 * x1, x2 must be in [0, 1]; y1, y2 may exceed [0, 1] (overshoot).
 * All values must be finite.
 */
export function validateCubicBezier(x1: number, y1: number, x2: number, y2: number): boolean {
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return false;
  }

  return x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1;
}

const CUBIC_BEZIER_RE = /^cubic-bezier\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;

/**
 * Returns true when `mode` is a valid interpolation mode:
 * linear, ease-in, ease-out, ease-in-out, step, or cubic-bezier(...).
 */
export function isValidInterpolationMode(mode: string): boolean {
  if (EASING_PRESETS.has(mode) || mode === 'step') {
    return true;
  }

  const match = CUBIC_BEZIER_RE.exec(mode);

  if (!match) {
    return false;
  }

  const x1 = Number(match[1]);
  const y1 = Number(match[2]);
  const x2 = Number(match[3]);
  const y2 = Number(match[4]);

  return validateCubicBezier(x1, y1, x2, y2);
}

// ---------------------------------------------------------------------------
// Keyframe
// ---------------------------------------------------------------------------

export interface KeyframeProperty {
  readonly value: unknown;
  readonly interpolation: string;
}

export interface Keyframe {
  readonly name: string;
  readonly action: 'none' | 'setState' | 'addModifier' | 'removeModifier';
  readonly offsetMs: number;
  readonly properties: Readonly<Record<string, KeyframeProperty>>;
  readonly payload?: string | undefined;
  readonly target?: string | undefined;
}

const keyframePropertySchema = z.object({
  value: z.unknown(),
  interpolation: z.string().refine(isValidInterpolationMode, {
    message: 'Invalid interpolation mode',
  }),
});

export const keyframeSchema = z.object({
  name: z.string(),
  action: z.enum(['none', 'setState', 'addModifier', 'removeModifier']),
  offsetMs: z.number().nonnegative(),
  properties: z.record(z.string(), keyframePropertySchema),
  payload: z.string().optional(),
  target: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface ChildTimelineBinding {
  readonly childElementId: string;
  readonly timeline: Timeline;
}

export interface Timeline {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly Keyframe[];
  readonly childTimelines?: readonly ChildTimelineBinding[] | undefined;
}

const childTimelineBindingSchema: z.ZodType<ChildTimelineBinding> = z.lazy(() =>
  z.object({
    childElementId: z.string().min(1),
    timeline: timelineSchema,
  }),
);

export const timelineSchema: z.ZodType<Timeline> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string(),
    entries: z.array(keyframeSchema),
    childTimelines: z.array(childTimelineBindingSchema).optional(),
  }),
);

// ---------------------------------------------------------------------------
// State / modifier bindings
// ---------------------------------------------------------------------------

export interface StateTimelineBinding {
  readonly stateName: string;
  readonly timelineId: string;
}

export interface ModifierTimelineBinding {
  readonly modifierName: string;
  readonly inTimelineId: string;
  readonly outTimelineId?: string;
}

const stateTimelineBindingSchema = z.object({
  stateName: z.string().min(1),
  timelineId: z.string().min(1),
});

const modifierTimelineBindingSchema = z.object({
  modifierName: z.string().min(1),
  inTimelineId: z.string().min(1),
  outTimelineId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Element animation config
// ---------------------------------------------------------------------------

export interface ElementAnimationConfig {
  readonly timelines: readonly Timeline[];
  readonly stateTimelineBindings: readonly StateTimelineBinding[];
  readonly modifierTimelineBindings: readonly ModifierTimelineBinding[];
}

export const elementAnimationConfigSchema = z.object({
  timelines: z.array(timelineSchema),
  stateTimelineBindings: z.array(stateTimelineBindingSchema),
  modifierTimelineBindings: z.array(modifierTimelineBindingSchema),
});

/** Creates an empty ElementAnimationConfig for new elements. */
export function createDefaultAnimationConfig(): ElementAnimationConfig {
  return {
    timelines: [],
    stateTimelineBindings: [],
    modifierTimelineBindings: [],
  };
}

// ---------------------------------------------------------------------------
// Animation registry
// ---------------------------------------------------------------------------

export interface AnimationRegistryEntry {
  readonly elementId: string;
  readonly config: ElementAnimationConfig;
}

const registryEntrySchema = z.object({
  elementId: z.string().min(1),
  config: elementAnimationConfigSchema,
});

export const animationRegistrySchema = z.array(registryEntrySchema).refine(
  (entries) => {
    const ids = new Set<string>();

    for (const entry of entries) {
      if (ids.has(entry.elementId)) {
        return false;
      }

      ids.add(entry.elementId);
    }

    return true;
  },
  { message: 'Duplicate element IDs in animation registry' },
);
