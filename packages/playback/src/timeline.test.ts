import type { AnimationDefinition, ElementAnimationConfig, Keyframe, Timeline } from '@broadset/model';

import {
  computeElementTimelineFrames,
  computeStaggerOffsetMs,
  computeTimelineDuration,
  computeTimelineFrame,
  computeTimelineLoopDuration,
  DEFAULT_TWEEN_DURATION_MS,
} from './timeline';

function createKeyframe(args: {
  readonly name: string;
  readonly offsetMs: number;
  readonly action?: Keyframe['action'] | undefined;
  readonly payload?: string | undefined;
  readonly target?: string | undefined;
  readonly properties?: Keyframe['properties'] | undefined;
}): Keyframe {
  return {
    name: args.name,
    action: args.action ?? 'none',
    offsetMs: args.offsetMs,
    properties: args.properties ?? {},
    payload: args.payload,
    target: args.target,
  };
}

function createTimeline(args: {
  readonly id: string;
  readonly name: string;
  readonly keyframes: readonly Keyframe[];
  readonly loop?: Timeline['loop'] | undefined;
  readonly loopCount?: Timeline['loopCount'] | undefined;
  readonly durationMs?: number | undefined;
  readonly childTimelines?: Timeline['childTimelines'] | undefined;
}): Timeline {
  return {
    id: args.id,
    name: args.name,
    keyframes: args.keyframes,
    loop: args.loop ?? 'none',
    loopCount: args.loopCount ?? null,
    durationMs: args.durationMs,
    childTimelines: args.childTimelines,
    audioCues: [],
  };
}

function createConfig(timelines: readonly Timeline[]): ElementAnimationConfig {
  return {
    timelines,
    stateTimelineBindings: [],
    modifierTimelineBindings: [],
    textAnimator: null,
  };
}

describe('computeTimelineDuration', () => {
  it('handles empty, multi-keyframe, explicit override, and child-extension cases', () => {
    const empty = createTimeline({ id: 'empty', name: 'Empty', keyframes: [] });
    const child = createTimeline({
      id: 'child',
      name: 'Child',
      keyframes: [createKeyframe({ name: 'start', offsetMs: 0 }), createKeyframe({ name: 'finish', offsetMs: 800 })],
    });
    const parent = createTimeline({
      id: 'parent',
      name: 'Parent',
      keyframes: [createKeyframe({ name: 'start', offsetMs: 200 })],
      childTimelines: [{ childElementId: 'child-el', timeline: child, delayMs: 200 }],
    });
    const overridden = createTimeline({
      id: 'override',
      name: 'Override',
      keyframes: [createKeyframe({ name: 'start', offsetMs: 1000 })],
      durationMs: 1800,
    });

    expect(computeTimelineDuration(empty)).toBe(0);
    expect(
      computeTimelineDuration(
        createTimeline({
          id: 'base',
          name: 'Base',
          keyframes: [
            createKeyframe({ name: 'a', offsetMs: 0 }),
            createKeyframe({ name: 'b', offsetMs: 500 }),
            createKeyframe({ name: 'c', offsetMs: 1000 }),
          ],
        }),
      ),
    ).toBe(1000 + DEFAULT_TWEEN_DURATION_MS);
    expect(computeTimelineDuration(parent)).toBe(200 + 800 + DEFAULT_TWEEN_DURATION_MS);
    expect(computeTimelineDuration(overridden)).toBe(1800);
  });

  it('computes loop and ping-pong effective durations', () => {
    const looping = createTimeline({
      id: 'looping',
      name: 'Looping',
      keyframes: [createKeyframe({ name: 'end', offsetMs: 1000 })],
      durationMs: 1000,
      loop: 'loop',
      loopCount: 3,
    });
    const pingPong = createTimeline({
      id: 'ping-pong',
      name: 'PingPong',
      keyframes: [createKeyframe({ name: 'end', offsetMs: 1000 })],
      durationMs: 1000,
      loop: 'ping-pong',
      loopCount: 2,
    });
    const infinite = createTimeline({
      id: 'infinite',
      name: 'Infinite',
      keyframes: [createKeyframe({ name: 'end', offsetMs: 1000 })],
      durationMs: 1000,
      loop: 'loop',
      loopCount: null,
    });

    expect(computeTimelineLoopDuration(looping)).toBe(3000);
    expect(computeTimelineLoopDuration(pingPong)).toBe(2000);
    expect(computeTimelineLoopDuration(infinite)).toBe(Infinity);
  });
});

describe('computeTimelineFrame', () => {
  it('interpolates between keyframes and derives deterministic state', () => {
    const timeline = createTimeline({
      id: 'intro',
      name: 'Intro',
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          action: 'setState',
          payload: 'IN',
          properties: {
            opacity: { type: 'number', value: 0, easing: 'linear' },
            visibility: { type: 'string', value: 'hidden', easing: 'step' },
          },
        }),
        createKeyframe({
          name: 'add-glow',
          offsetMs: 200,
          action: 'addModifier',
          payload: 'glow',
        }),
        createKeyframe({
          name: 'remove-glow',
          offsetMs: 500,
          action: 'removeModifier',
          payload: 'glow',
        }),
        createKeyframe({
          name: 'finish',
          offsetMs: 1000,
          action: 'setState',
          payload: 'active',
          properties: {
            opacity: { type: 'number', value: 1, easing: 'linear' },
            visibility: { type: 'string', value: 'visible', easing: 'step' },
          },
        }),
      ],
    });

    expect(computeTimelineFrame({ timeline, timeMs: 0 }).properties).toEqual({ opacity: 0, visibility: 'hidden' });
    expect(computeTimelineFrame({ timeline, timeMs: 250 }).activeState).toBe('IN');
    expect(Array.from(computeTimelineFrame({ timeline, timeMs: 300 }).modifiers)).toEqual(['glow']);
    expect(Array.from(computeTimelineFrame({ timeline, timeMs: 600 }).modifiers)).toEqual([]);
    expect(computeTimelineFrame({ timeline, timeMs: 500 }).properties['opacity']).toBeCloseTo(0.5, 6);
    expect(computeTimelineFrame({ timeline, timeMs: 500 }).properties['visibility']).toBe('hidden');
    expect(computeTimelineFrame({ timeline, timeMs: 5000 }).properties['opacity']).toBe(1);
    expect(computeTimelineFrame({ timeline, timeMs: 750 }).activeState).toBe('IN');
    expect(computeTimelineFrame({ timeline, timeMs: 1200 }).activeState).toBe('active');
  });

  it('omits properties before the first keyframe and supports target property routing', () => {
    const timeline = createTimeline({
      id: 'targeted',
      name: 'Targeted',
      keyframes: [
        createKeyframe({
          name: 'fade-start',
          offsetMs: 0,
          target: 'other-el',
          properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
        }),
        createKeyframe({
          name: 'fade-end',
          offsetMs: 1000,
          target: 'other-el',
          properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
        }),
      ],
    });

    const beforeStart = computeTimelineFrame({ timeline, timeMs: -100 });
    const midpoint = computeTimelineFrame({ timeline, timeMs: 500 });

    expect(beforeStart.properties).toEqual({});
    expect(midpoint.properties['opacity']).toBeUndefined();
    expect(midpoint.targetProperties['other-el']?.['opacity']).toBeCloseTo(0.5, 6);
  });

  it('composes child timelines, stagger offsets, ping-pong time mapping, and motion paths', () => {
    const childTimeline = createTimeline({
      id: 'child',
      name: 'Child',
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
        }),
        createKeyframe({
          name: 'end',
          offsetMs: 1000,
          properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
        }),
      ],
    });
    const parent = createTimeline({
      id: 'parent',
      name: 'Parent',
      keyframes: [createKeyframe({ name: 'start', offsetMs: 0 })],
      childTimelines: [
        { childElementId: 'child-a', timeline: childTimeline, delayMs: 200, direction: 'normal' },
        { childElementId: 'child-b', timeline: childTimeline, delayMs: 200, direction: 'normal' },
        { childElementId: 'child-c', timeline: childTimeline, delayMs: 200, direction: 'normal' },
      ],
    });
    const pingPong = createTimeline({
      id: 'ping-pong',
      name: 'PingPong',
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
        }),
        createKeyframe({
          name: 'end',
          offsetMs: 1000,
          properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
        }),
      ],
      durationMs: 1000,
      loop: 'ping-pong',
      loopCount: 2,
    });
    const motionPath = createTimeline({
      id: 'path',
      name: 'Path',
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: {
            motionPath: { type: 'string', value: 'M 0 0 Q 100 100 200 0', easing: 'linear' },
            motionRotate: { type: 'string', value: 'true', easing: 'step' },
          },
        }),
        createKeyframe({
          name: 'end',
          offsetMs: 1000,
          properties: {
            motionPath: { type: 'string', value: 'M 0 0 Q 100 100 200 0', easing: 'linear' },
            motionRotate: { type: 'string', value: 'true', easing: 'step' },
          },
        }),
      ],
    });

    expect(computeStaggerOffsetMs({ index: 0, childCount: 4, delayMs: 200, direction: 'normal' })).toBe(0);
    expect(computeStaggerOffsetMs({ index: 3, childCount: 4, delayMs: 200, direction: 'reverse' })).toBe(0);
    expect(computeStaggerOffsetMs({ index: 2, childCount: 5, delayMs: 100, direction: 'center' })).toBe(0);

    expect(computeTimelineFrame({ timeline: parent, timeMs: 100 }).childFrames).toEqual({});

    const childFrame = computeTimelineFrame({ timeline: parent, timeMs: 700 }).childFrames['child-a'];

    expect(childFrame?.properties['opacity']).toBeCloseTo(0.5, 6);
    expect(computeTimelineFrame({ timeline: pingPong, timeMs: 1500 }).properties['opacity']).toBeCloseTo(0.5, 6);

    const pathFrame = computeTimelineFrame({ timeline: motionPath, timeMs: 500 });

    expect(Number(pathFrame.properties['x'])).toBeGreaterThan(90);
    expect(Number(pathFrame.properties['x'])).toBeLessThan(110);
    expect(Number(pathFrame.properties['y'])).toBeGreaterThan(40);
    expect(typeof pathFrame.properties['rotation']).toBe('number');
  });
});

describe('computeElementTimelineFrames', () => {
  it('returns an empty array for missing elements and computes all named timelines for matches', () => {
    const intro = createTimeline({
      id: 'tl-intro',
      name: 'intro',
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
        }),
        createKeyframe({
          name: 'end',
          offsetMs: 1000,
          properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
        }),
      ],
    });
    const outro = createTimeline({
      id: 'tl-outro',
      name: 'outro',
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
        }),
        createKeyframe({
          name: 'end',
          offsetMs: 500,
          properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
        }),
      ],
    });
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'hero',
        config: createConfig([intro, outro]),
      },
    ];

    expect(computeElementTimelineFrames({ animations, elementId: 'missing', timeMs: 250 })).toEqual([]);

    const frames = computeElementTimelineFrames({ animations, elementId: 'hero', timeMs: 250 });

    expect(frames).toHaveLength(2);
    expect(frames[0]?.timelineName).toBe('intro');
    expect(frames[1]?.timelineName).toBe('outro');
    expect(frames[0]?.properties['opacity']).toBeCloseTo(0.25, 6);
    expect(frames[1]?.properties['opacity']).toBeCloseTo(0.5, 6);
  });
});
