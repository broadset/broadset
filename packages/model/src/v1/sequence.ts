import { z } from 'zod';

import { type ColorValue, colorValueSchema } from './color';
import { type ExpressionAst, expressionAstSchema } from './data';
import { type StructuredPath, structuredPathSchema } from './element';
import { type Id, idSchema, type PropertyTarget, propertyTargetSchema } from './identity';
import { nonEmptyStringSchema, nonNegativeSafeIntegerSchema, positiveSafeIntegerSchema } from './schema-helpers';
import { type TypedValue, typedValueSchema, type ValueType, valueTypeSchema } from './typed-value';

const nonNegativeFiniteNumberSchema = z.number().nonnegative();
const positiveFiniteNumberSchema = z.number().positive();
const timeRangeSchema = z.tuple([nonNegativeSafeIntegerSchema, nonNegativeSafeIntegerSchema]);

export type LoopDefinition =
  | { readonly kind: 'none' }
  | { readonly kind: 'repeat'; readonly count?: number | undefined; readonly gapTicks: number }
  | {
      readonly kind: 'ping-pong';
      readonly count?: number | undefined;
      readonly gapTicks: number;
      readonly endpoint: 'once' | 'duplicate';
    };

export type Interpolation =
  | { readonly kind: 'hold' }
  | { readonly kind: 'step'; readonly position: 'start' | 'end' }
  | { readonly kind: 'cubic-bezier'; readonly controlPoints: readonly [number, number, number, number] }
  | {
      readonly kind: 'spring';
      readonly mass: number;
      readonly stiffness: number;
      readonly damping: number;
      readonly initialVelocity: number;
      readonly settleThreshold: number;
    }
  | { readonly kind: 'spatial-path'; readonly path: StructuredPath; readonly orientToPath: boolean }
  | {
      readonly kind: 'counting';
      readonly rounding: 'floor' | 'ceil' | 'round' | 'truncate';
      readonly minimumDigits: number;
      readonly grouping: boolean;
    }
  | {
      readonly kind: 'color';
      readonly space: 'srgb' | 'display-p3' | 'rec2020' | 'lab' | 'oklab' | 'oklch' | 'cmyk' | 'gray';
    };

export interface Keyframe {
  readonly id: Id;
  readonly tick: number;
  readonly value: TypedValue;
  readonly interpolation?: Interpolation | undefined;
}

export interface Track {
  readonly id: Id;
  readonly name: string;
  readonly target: PropertyTarget;
  readonly valueType: ValueType;
  readonly keyframes: readonly Keyframe[];
}

export interface Marker {
  readonly id: Id;
  readonly tick: number;
  readonly label: string;
  readonly color?: ColorValue | undefined;
}

export type Cue =
  | {
      readonly id: Id;
      readonly kind: 'audio';
      readonly tick: number;
      readonly assetId: Id;
      readonly gain: number;
      readonly firing: CueFiring;
    }
  | {
      readonly id: Id;
      readonly kind: 'event';
      readonly tick: number;
      readonly eventId: Id;
      readonly payload?: TypedValue | undefined;
      readonly firing: CueFiring;
    };

type CueFiring = 'forward-only' | 'explicit-only' | 'forward-and-explicit';

export type ClipRemap =
  | {
      readonly kind: 'linear';
      readonly sourceRange: readonly [number, number];
      readonly direction: 'forward' | 'reverse';
    }
  | { readonly kind: 'freeze'; readonly sourceTick: number };

export interface SequenceClip {
  readonly id: Id;
  readonly sequenceId: Id;
  readonly outputRange: readonly [number, number];
  readonly remap: ClipRemap;
  readonly stagger?:
    | {
        readonly index: number;
        readonly intervalTicks: number;
        readonly jitterTicks: number;
        readonly seed: number;
      }
    | undefined;
}

export interface Sequence {
  readonly id: Id;
  readonly name: string;
  readonly durationTicks: number;
  readonly workArea?: readonly [number, number] | undefined;
  readonly loop: LoopDefinition;
  readonly tracks: readonly Track[];
  readonly markers: readonly Marker[];
  readonly cues: readonly Cue[];
  readonly childClips: readonly SequenceClip[];
}

export const loopDefinitionSchema: z.ZodType<LoopDefinition> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('repeat'),
    count: positiveSafeIntegerSchema.optional(),
    gapTicks: nonNegativeSafeIntegerSchema,
  }),
  z.strictObject({
    kind: z.literal('ping-pong'),
    count: positiveSafeIntegerSchema.optional(),
    gapTicks: nonNegativeSafeIntegerSchema,
    endpoint: z.enum(['once', 'duplicate']),
  }),
]);

export const interpolationSchema: z.ZodType<Interpolation> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('hold') }),
  z.strictObject({ kind: z.literal('step'), position: z.enum(['start', 'end']) }),
  z.strictObject({
    kind: z.literal('cubic-bezier'),
    controlPoints: z.tuple([z.number().min(0).max(1), z.number(), z.number().min(0).max(1), z.number()]),
  }),
  z.strictObject({
    kind: z.literal('spring'),
    mass: positiveFiniteNumberSchema,
    stiffness: positiveFiniteNumberSchema,
    damping: nonNegativeFiniteNumberSchema,
    initialVelocity: z.number(),
    settleThreshold: positiveFiniteNumberSchema,
  }),
  z.strictObject({ kind: z.literal('spatial-path'), path: structuredPathSchema, orientToPath: z.boolean() }),
  z.strictObject({
    kind: z.literal('counting'),
    rounding: z.enum(['floor', 'ceil', 'round', 'truncate']),
    minimumDigits: nonNegativeSafeIntegerSchema,
    grouping: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('color'),
    space: z.enum(['srgb', 'display-p3', 'rec2020', 'lab', 'oklab', 'oklch', 'cmyk', 'gray']),
  }),
]);

export const keyframeSchema: z.ZodType<Keyframe> = z.strictObject({
  id: idSchema,
  tick: nonNegativeSafeIntegerSchema,
  value: typedValueSchema,
  interpolation: interpolationSchema.optional(),
});

export function interpolationMatchesType(interpolation: Interpolation, valueType: ValueType): boolean {
  if (interpolation.kind === 'hold' || interpolation.kind === 'step') return true;
  if (interpolation.kind === 'counting') return valueType === 'string';
  if (interpolation.kind === 'color') return valueType === 'color';
  if (interpolation.kind === 'spatial-path') return valueType === 'point2d' || valueType === 'point3d';

  return ['integer', 'number', 'length', 'angle', 'point2d', 'point3d'].includes(valueType);
}

export const trackSchema: z.ZodType<Track> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  target: propertyTargetSchema,
  valueType: valueTypeSchema,
  keyframes: z.array(keyframeSchema).min(1),
});

export const markerSchema: z.ZodType<Marker> = z.strictObject({
  id: idSchema,
  tick: nonNegativeSafeIntegerSchema,
  label: nonEmptyStringSchema,
  color: colorValueSchema.optional(),
});

const cueFiringSchema = z.enum(['forward-only', 'explicit-only', 'forward-and-explicit']);

export const cueSchema: z.ZodType<Cue> = z.discriminatedUnion('kind', [
  z.strictObject({
    id: idSchema,
    kind: z.literal('audio'),
    tick: nonNegativeSafeIntegerSchema,
    assetId: idSchema,
    gain: nonNegativeFiniteNumberSchema,
    firing: cueFiringSchema,
  }),
  z.strictObject({
    id: idSchema,
    kind: z.literal('event'),
    tick: nonNegativeSafeIntegerSchema,
    eventId: idSchema,
    payload: typedValueSchema.optional(),
    firing: cueFiringSchema,
  }),
]);
export const clipRemapSchema: z.ZodType<ClipRemap> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('linear'),
    sourceRange: timeRangeSchema,
    direction: z.enum(['forward', 'reverse']),
  }),
  z.strictObject({ kind: z.literal('freeze'), sourceTick: nonNegativeSafeIntegerSchema }),
]);
export const sequenceClipSchema: z.ZodType<SequenceClip> = z.strictObject({
  id: idSchema,
  sequenceId: idSchema,
  outputRange: timeRangeSchema,
  remap: clipRemapSchema,
  stagger: z
    .strictObject({
      index: nonNegativeSafeIntegerSchema,
      intervalTicks: nonNegativeSafeIntegerSchema,
      jitterTicks: nonNegativeSafeIntegerSchema,
      seed: nonNegativeSafeIntegerSchema,
    })
    .optional(),
});

export const sequenceSchema: z.ZodType<Sequence> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  durationTicks: nonNegativeSafeIntegerSchema,
  workArea: timeRangeSchema.optional(),
  loop: loopDefinitionSchema,
  tracks: z.array(trackSchema),
  markers: z.array(markerSchema),
  cues: z.array(cueSchema),
  childClips: z.array(sequenceClipSchema),
});

export type SequenceAction =
  | { readonly kind: 'play-sequence'; readonly sequenceId: Id; readonly behavior: 'restart' | 'resume' }
  | { readonly kind: 'stop-sequence'; readonly sequenceId: Id }
  | { readonly kind: 'seek-sequence'; readonly sequenceId: Id; readonly tick: number }
  | { readonly kind: 'send-event'; readonly stateMachineId: Id; readonly eventId: Id };

export interface LifecycleDefinition {
  readonly id: Id;
  readonly in: readonly SequenceAction[];
  readonly hold: readonly SequenceAction[];
  readonly update: readonly SequenceAction[];
  readonly out: readonly SequenceAction[];
}
export interface StateValue {
  readonly id: Id;
  readonly target: PropertyTarget;
  readonly value: TypedValue;
}
export interface State {
  readonly id: Id;
  readonly name: string;
  readonly values: readonly StateValue[];
  readonly entryActions: readonly SequenceAction[];
  readonly exitActions: readonly SequenceAction[];
}
export type TransitionTrigger =
  | { readonly kind: 'event'; readonly eventId: Id }
  | { readonly kind: 'lifecycle'; readonly phase: 'in' | 'hold' | 'update' | 'out' }
  | { readonly kind: 'after'; readonly ticks: number };
export interface Transition {
  readonly id: Id;
  readonly sourceStateId: Id;
  readonly targetStateId: Id;
  readonly trigger: TransitionTrigger;
  readonly guard?: ExpressionAst | undefined;
  readonly priority: number;
  readonly actions: readonly SequenceAction[];
}
export interface StateMachine {
  readonly id: Id;
  readonly name: string;
  readonly initialStateId: Id;
  readonly states: readonly State[];
  readonly transitions: readonly Transition[];
}

export const sequenceActionSchema: z.ZodType<SequenceAction> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('play-sequence'), sequenceId: idSchema, behavior: z.enum(['restart', 'resume']) }),
  z.strictObject({ kind: z.literal('stop-sequence'), sequenceId: idSchema }),
  z.strictObject({ kind: z.literal('seek-sequence'), sequenceId: idSchema, tick: nonNegativeSafeIntegerSchema }),
  z.strictObject({ kind: z.literal('send-event'), stateMachineId: idSchema, eventId: idSchema }),
]);

export const lifecycleDefinitionSchema: z.ZodType<LifecycleDefinition> = z.strictObject({
  id: idSchema,
  in: z.array(sequenceActionSchema),
  hold: z.array(sequenceActionSchema),
  update: z.array(sequenceActionSchema),
  out: z.array(sequenceActionSchema),
});

export const stateValueSchema: z.ZodType<StateValue> = z.strictObject({
  id: idSchema,
  target: propertyTargetSchema,
  value: typedValueSchema,
});
export const stateSchema: z.ZodType<State> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  values: z.array(stateValueSchema),
  entryActions: z.array(sequenceActionSchema),
  exitActions: z.array(sequenceActionSchema),
});
export const transitionTriggerSchema: z.ZodType<TransitionTrigger> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('event'), eventId: idSchema }),
  z.strictObject({ kind: z.literal('lifecycle'), phase: z.enum(['in', 'hold', 'update', 'out']) }),
  z.strictObject({ kind: z.literal('after'), ticks: positiveSafeIntegerSchema }),
]);
export const transitionSchema: z.ZodType<Transition> = z.strictObject({
  id: idSchema,
  sourceStateId: idSchema,
  targetStateId: idSchema,
  trigger: transitionTriggerSchema,
  guard: expressionAstSchema.optional(),
  priority: nonNegativeSafeIntegerSchema,
  actions: z.array(sequenceActionSchema),
});

export const stateMachineSchema: z.ZodType<StateMachine> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  initialStateId: idSchema,
  states: z.array(stateSchema).min(1),
  transitions: z.array(transitionSchema),
});
