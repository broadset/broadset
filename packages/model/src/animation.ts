import { z } from 'zod';

import { isValidSvgPathData } from './element';

const EASING_PRESETS = new Set([
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step',
  'counting',
  'spring-gentle',
  'spring-bouncy',
  'spring-stiff',
]);

const CUBIC_BEZIER_RE = /^cubic-bezier\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;
const SPRING_RE = /^spring\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;
const GRADIENT_STOP_RE = /^backgroundGradient\.stops\[(\d+)\]\.(color|position)$/;

/** Expected keyframe value type for each gradient animation target pattern. */
const GRADIENT_TARGET_TYPES: Readonly<Record<string, string>> = {
  'backgroundGradient.angle': 'number',
  'backgroundGradient.center': 'tuple',
};

export type EasingMode =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'step'
  | 'counting'
  | 'spring-gentle'
  | 'spring-bouncy'
  | 'spring-stiff'
  | `cubic-bezier(${string})`
  | `spring(${string})`;

export function validateCubicBezier(x1: number, y1: number, x2: number, y2: number): boolean {
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return false;
  }

  return x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1;
}

function validateSpring(stiffness: number, damping: number, mass: number): boolean {
  return (
    Number.isFinite(stiffness) &&
    Number.isFinite(damping) &&
    Number.isFinite(mass) &&
    stiffness > 0 &&
    damping > 0 &&
    mass > 0
  );
}

export function isValidInterpolationMode(mode: string): boolean {
  if (EASING_PRESETS.has(mode)) {
    return true;
  }

  const cubicBezierMatch = CUBIC_BEZIER_RE.exec(mode);

  if (cubicBezierMatch !== null) {
    return validateCubicBezier(
      Number(cubicBezierMatch[1]),
      Number(cubicBezierMatch[2]),
      Number(cubicBezierMatch[3]),
      Number(cubicBezierMatch[4]),
    );
  }

  const springMatch = SPRING_RE.exec(mode);

  if (springMatch !== null) {
    return validateSpring(Number(springMatch[1]), Number(springMatch[2]), Number(springMatch[3]));
  }

  return false;
}

export interface TimecodeAnnotation {
  readonly timecode: string;
  readonly frameRate: number;
}

export interface NumberKeyframeValue {
  readonly type: 'number';
  readonly value: number;
  readonly easing: EasingMode;
}

export interface ColorKeyframeValue {
  readonly type: 'color';
  readonly value: string;
  readonly easing: EasingMode;
}

export interface CountingFormat {
  readonly decimalPlaces?: number | undefined;
  readonly thousandsSeparator?: string | undefined;
  readonly prefix?: string | undefined;
  readonly suffix?: string | undefined;
}

export interface StringKeyframeValue {
  readonly type: 'string';
  readonly value: string;
  readonly easing: EasingMode;
  readonly countingFormat?: CountingFormat | undefined;
}

export interface TupleKeyframeValue {
  readonly type: 'tuple';
  readonly value: readonly number[];
  readonly easing: EasingMode;
}

export type KeyframeValue = NumberKeyframeValue | ColorKeyframeValue | StringKeyframeValue | TupleKeyframeValue;

export interface Keyframe {
  readonly name: string;
  readonly action: 'none' | 'setState' | 'addModifier' | 'removeModifier';
  readonly offsetMs: number;
  readonly properties: Readonly<Record<string, KeyframeValue>>;
  readonly payload?: string | undefined;
  readonly target?: string | undefined;
  readonly timecodeAnnotation?: TimecodeAnnotation | undefined;
}

export interface AudioCue {
  readonly assetId: string;
  readonly offsetMs: number;
  readonly volume: number;
  readonly loop: boolean;
}

export interface ChildTimelineBinding {
  readonly childElementId: string;
  readonly timeline: Timeline;
  readonly delayMs?: number | undefined;
  readonly direction?: 'normal' | 'reverse' | 'center' | undefined;
}

export interface Timeline {
  readonly id: string;
  readonly name: string;
  readonly keyframes: readonly Keyframe[];
  readonly loop?: 'none' | 'loop' | 'ping-pong' | undefined;
  readonly loopCount?: number | null | undefined;
  readonly durationMs?: number | undefined;
  readonly childTimelines?: readonly ChildTimelineBinding[] | undefined;
  readonly audioCues?: readonly AudioCue[] | undefined;
}

export interface StateTimelineBinding {
  readonly stateName: string;
  readonly timelineId: string;
}

export interface ModifierTimelineBinding {
  readonly modifierName: string;
  readonly inTimelineId: string;
  readonly outTimelineId?: string | undefined;
}

export interface TextAnimator {
  readonly rangeMode: 'characters' | 'words' | 'lines';
  readonly staggerDelayMs: number;
  readonly randomOrder: boolean;
  readonly timelineId: string;
}

export interface ElementAnimationConfig {
  readonly timelines: readonly Timeline[];
  readonly stateTimelineBindings: readonly StateTimelineBinding[];
  readonly modifierTimelineBindings: readonly ModifierTimelineBinding[];
  readonly textAnimator: TextAnimator | null;
}

export interface AnimationDefinition {
  readonly elementId: string;
  readonly config: ElementAnimationConfig;
}

const easingModeSchema = z
  .string()
  .refine(isValidInterpolationMode)
  .transform((value): EasingMode => value as EasingMode);

const timecodeAnnotationSchema = z.object({
  timecode: z.string().min(1),
  frameRate: z.number().positive(),
});

const countingFormatSchema = z.object({
  decimalPlaces: z.number().int().nonnegative().optional(),
  thousandsSeparator: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

const keyframePropertySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('number'), value: z.number(), easing: easingModeSchema }),
  z.object({ type: z.literal('color'), value: z.string(), easing: easingModeSchema }),
  z.object({
    type: z.literal('string'),
    value: z.string(),
    easing: easingModeSchema,
    countingFormat: countingFormatSchema.optional(),
  }),
  z.object({ type: z.literal('tuple'), value: z.array(z.number()), easing: easingModeSchema }),
]);

type KeyframeProperty = z.infer<typeof keyframePropertySchema>;

function validateMotionPath(motionPath: KeyframeProperty | undefined, context: z.RefinementCtx): void {
  if (motionPath === undefined) return;

  if (motionPath.type !== 'string') {
    context.addIssue({
      code: 'custom',
      message: 'motionPath must use a string keyframe value',
      path: ['properties', 'motionPath'],
    });

    return;
  }

  if (!isValidSvgPathData(motionPath.value)) {
    context.addIssue({
      code: 'custom',
      message: 'motionPath must be valid SVG path data',
      path: ['properties', 'motionPath'],
    });
  }
}

function validateGradientPropertyType(key: string, prop: KeyframeProperty, context: z.RefinementCtx): void {
  const fixedType = GRADIENT_TARGET_TYPES[key];

  if (fixedType !== undefined) {
    if (prop.type !== fixedType) {
      context.addIssue({
        code: 'custom',
        message: `${key} must use a '${fixedType}' keyframe value`,
        path: ['properties', key],
      });
    }

    return;
  }

  const stopMatch = GRADIENT_STOP_RE.exec(key);

  if (stopMatch === null) return;

  const expectedType = stopMatch[2] === 'color' ? 'color' : 'number';

  if (prop.type !== expectedType) {
    context.addIssue({
      code: 'custom',
      message: `${key} must use a '${expectedType}' keyframe value`,
      path: ['properties', key],
    });
  }
}

export const keyframeSchema: z.ZodType<Keyframe> = z
  .object({
    name: z.string(),
    action: z.enum(['none', 'setState', 'addModifier', 'removeModifier']),
    offsetMs: z.number().nonnegative(),
    properties: z.record(z.string(), keyframePropertySchema),
    payload: z.string().optional(),
    target: z.string().optional(),
    timecodeAnnotation: timecodeAnnotationSchema.optional(),
  })
  .superRefine((value, context) => {
    validateMotionPath(value.properties['motionPath'], context);

    for (const [key, prop] of Object.entries(value.properties)) {
      validateGradientPropertyType(key, prop, context);
    }
  });

const audioCueSchema = z.object({
  assetId: z.string().min(1),
  offsetMs: z.number().nonnegative(),
  volume: z.number().min(0).max(1).default(1),
  loop: z.boolean().default(false),
});

const textAnimatorSchema = z.object({
  rangeMode: z.enum(['characters', 'words', 'lines']),
  staggerDelayMs: z.number().nonnegative(),
  randomOrder: z.boolean().default(false),
  timelineId: z.string().min(1),
});

export const timelineSchema: z.ZodType<Timeline> = z.lazy(() => {
  const childTimelineBindingSchema: z.ZodType<ChildTimelineBinding> = z.object({
    childElementId: z.string().min(1),
    timeline: timelineSchema,
    delayMs: z.number().positive().optional(),
    direction: z.enum(['normal', 'reverse', 'center']).optional(),
  });

  return z
    .object({
      id: z.string().min(1),
      name: z.string(),
      keyframes: z.array(keyframeSchema),
      loop: z.enum(['none', 'loop', 'ping-pong']).optional(),
      loopCount: z.number().int().positive().nullable().optional(),
      durationMs: z.number().positive().optional(),
      childTimelines: z.array(childTimelineBindingSchema).optional(),
      audioCues: z.array(audioCueSchema).optional(),
    })
    .superRefine((value, context) => {
      const maxOffsetMs = value.keyframes.reduce((currentMax, keyframe) => Math.max(currentMax, keyframe.offsetMs), 0);

      if (value.durationMs !== undefined && value.durationMs < maxOffsetMs) {
        context.addIssue({
          code: 'custom',
          message: 'durationMs cannot be shorter than the maximum keyframe offset',
          path: ['durationMs'],
        });
      }
    })
    .transform(
      (value): Timeline => ({
        id: value.id,
        name: value.name,
        keyframes: value.keyframes,
        loop: value.loop ?? 'none',
        loopCount: value.loopCount ?? null,
        durationMs: value.durationMs,
        childTimelines: value.childTimelines,
        audioCues: value.audioCues ?? [],
      }),
    );
});

const stateTimelineBindingSchema = z.object({
  stateName: z.string().min(1),
  timelineId: z.string().min(1),
});

const modifierTimelineBindingSchema = z.object({
  modifierName: z.string().min(1),
  inTimelineId: z.string().min(1),
  outTimelineId: z.string().min(1).optional(),
});

export const elementAnimationConfigSchema: z.ZodType<ElementAnimationConfig> = z
  .object({
    timelines: z.array(timelineSchema),
    stateTimelineBindings: z.array(stateTimelineBindingSchema),
    modifierTimelineBindings: z.array(modifierTimelineBindingSchema),
    textAnimator: textAnimatorSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.stateTimelineBindings.length > 0) {
      const stateNames = new Set(value.stateTimelineBindings.map((binding) => binding.stateName));

      if (!stateNames.has('IN') || !stateNames.has('OUT')) {
        context.addIssue({
          code: 'custom',
          message:
            'stateTimelineBindings must include the reserved IN and OUT state bindings when bindings are present',
          path: ['stateTimelineBindings'],
        });
      }
    }

    if (value.textAnimator !== null && value.textAnimator !== undefined) {
      const timelineIds = new Set(value.timelines.map((timeline) => timeline.id));

      if (!timelineIds.has(value.textAnimator.timelineId)) {
        context.addIssue({
          code: 'custom',
          message: 'textAnimator.timelineId must reference a timeline in the same config',
          path: ['textAnimator', 'timelineId'],
        });
      }
    }
  })
  .transform(
    (value): ElementAnimationConfig => ({
      timelines: value.timelines,
      stateTimelineBindings: value.stateTimelineBindings,
      modifierTimelineBindings: value.modifierTimelineBindings,
      textAnimator: value.textAnimator ?? null,
    }),
  );

export function createDefaultAnimationConfig(): ElementAnimationConfig {
  return {
    timelines: [],
    stateTimelineBindings: [],
    modifierTimelineBindings: [],
    textAnimator: null,
  };
}

const animationDefinitionSchema: z.ZodType<AnimationDefinition> = z.object({
  elementId: z.string().min(1),
  config: elementAnimationConfigSchema,
});

export const animationsSchema = z.array(animationDefinitionSchema).refine(
  (entries) => {
    const seenIds = new Set<string>();

    for (const entry of entries) {
      if (seenIds.has(entry.elementId)) {
        return false;
      }

      seenIds.add(entry.elementId);
    }

    return true;
  },
  { message: 'Duplicate element IDs in animations' },
);
