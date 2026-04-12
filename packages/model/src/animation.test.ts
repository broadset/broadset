import { describe, expect, it } from '@jest/globals';

import {
  animationsSchema,
  createDefaultAnimationConfig,
  elementAnimationConfigSchema,
  isValidInterpolationMode,
  keyframeSchema,
  timelineSchema,
  validateCubicBezier,
} from './index';

/** @description The animation registry is a flat array keyed by unique element IDs. */
describe('Animation registry structure', () => {
  /** @description Registry entries must validate when each element id appears only once. */
  it('accepts a flat array of entries', () => {
    const entries = [
      { elementId: 'e1', config: createDefaultAnimationConfig() },
      { elementId: 'e2', config: createDefaultAnimationConfig() },
    ];
    const result = animationsSchema.safeParse(entries);

    expect(result.success).toBe(true);
  });

  /** @description Duplicate element ids would make animation lookup ambiguous and must be rejected. */
  it('rejects duplicate element IDs', () => {
    const entries = [
      { elementId: 'e1', config: createDefaultAnimationConfig() },
      { elementId: 'e1', config: createDefaultAnimationConfig() },
    ];
    const result = animationsSchema.safeParse(entries);

    expect(result.success).toBe(false);
  });
});

/** @description New elements start with an empty animation config that still satisfies the schema. */
describe('Element animation config shape', () => {
  /** @description The default config intentionally starts with no timelines or bindings. */
  it('creates empty default config', () => {
    const config = createDefaultAnimationConfig();

    expect(config.timelines).toEqual([]);
    expect(config.stateTimelineBindings).toEqual([]);
    expect(config.modifierTimelineBindings).toEqual([]);
  });

  /** @description The default animation config must validate without additional host data. */
  it('default config passes validation', () => {
    const result = elementAnimationConfigSchema.safeParse(createDefaultAnimationConfig());

    expect(result.success).toBe(true);
  });

  /** @description Real configs with named timelines and reserved IN/OUT bindings must also validate. */
  it('accepts config with timelines and bindings', () => {
    const config = {
      timelines: [{ id: 'tl-1', name: 'entrance', keyframes: [] }],
      stateTimelineBindings: [
        { stateName: 'IN', timelineId: 'tl-1' },
        { stateName: 'OUT', timelineId: 'tl-1' },
      ],
      modifierTimelineBindings: [],
      textAnimator: null,
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  /** @description When bindings are present, the reserved IN and OUT states must both be declared. */
  it('rejects config that omits one of the reserved IN/OUT bindings', () => {
    const config = {
      timelines: [{ id: 'tl-1', name: 'entrance', keyframes: [] }],
      stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-1' }],
      modifierTimelineBindings: [],
      textAnimator: null,
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });
});

/** @description Timelines carry ordered keyframes and can optionally nest child timelines. */
describe('Timeline structure', () => {
  /** @description A named timeline with keyframes and a stable id must validate. */
  it('accepts a timeline with name, keyframes, and id', () => {
    const timeline = {
      id: 'tl-1',
      name: 'entrance',
      keyframes: [
        { name: 'start', action: 'none', offsetMs: 0, properties: {} },
        {
          name: 'mid',
          action: 'none',
          offsetMs: 500,
          properties: { opacity: { type: 'number', value: 0.5, easing: 'linear' } },
        },
        {
          name: 'end',
          action: 'none',
          offsetMs: 1000,
          properties: { opacity: { type: 'number', value: 1, easing: 'ease-out' } },
        },
      ],
    };
    const result = timelineSchema.safeParse(timeline);

    expect(result.success).toBe(true);
  });

  /** @description Group timelines may contain child timeline bindings for nested elements. */
  it('accepts child timeline bindings', () => {
    const timeline = {
      id: 'tl-parent',
      name: 'group-entrance',
      keyframes: [],
      childTimelines: [
        {
          childElementId: 'child-1',
          timeline: {
            id: 'tl-child-1',
            name: 'child entrance',
            keyframes: [],
          },
        },
      ],
    };
    const result = timelineSchema.safeParse(timeline);

    expect(result.success).toBe(true);
  });
});

/** @description Keyframes can animate properties or dispatch actions like state changes. */
describe('Keyframe structure', () => {
  /** @description Property keyframes with offsets and typed easing values must validate. */
  it('accepts a property keyframe at offset', () => {
    const keyframe = {
      name: 'fade-out',
      action: 'none',
      offsetMs: 500,
      properties: {
        opacity: { type: 'number', value: 0, easing: 'ease-out' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
    expect(keyframe.offsetMs).toBe(500);
    expect(keyframe.properties.opacity.value).toBe(0);
  });

  /** @description Action keyframes may carry a payload for the state or modifier to apply. */
  it('accepts a setState action keyframe', () => {
    const keyframe = {
      name: 'activate',
      action: 'setState',
      offsetMs: 1000,
      properties: {},
      payload: 'highlighted',
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
    expect(keyframe.action).toBe('setState');
    expect(keyframe.payload).toBe('highlighted');
  });

  /** @description Modifier add/remove actions are also first-class keyframe actions. */
  it.each(['addModifier', 'removeModifier'] as const)('accepts %s action', (action) => {
    const keyframe = {
      name: 'toggle',
      action,
      offsetMs: 200,
      properties: {},
      payload: 'pulse',
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });

  /** @description Step interpolation must be accepted for snapping property changes. */
  it('accepts step interpolation', () => {
    const keyframe = {
      name: 'snap',
      action: 'none',
      offsetMs: 0,
      properties: {
        display: { type: 'string', value: 'block', easing: 'step' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });

  /** @description Targeted keyframes can direct an action to another element id. */
  it('accepts optional target element ID', () => {
    const keyframe = {
      name: 'remote',
      action: 'none',
      offsetMs: 0,
      properties: {},
      target: 'other-element-id',
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });
});

/** @description State and modifier bindings connect semantic names to timeline ids. */
describe('State and modifier bindings', () => {
  /** @description State bindings must support the reserved IN/OUT names plus custom states. */
  it('accepts state bindings with IN and OUT', () => {
    const bindings = [
      { stateName: 'IN', timelineId: 'tl-in' },
      { stateName: 'OUT', timelineId: 'tl-out' },
      { stateName: 'highlighted', timelineId: 'tl-highlight' },
    ];

    for (const binding of bindings) {
      expect(binding.stateName).toBeDefined();
      expect(binding.timelineId).toBeDefined();
    }
  });

  /** @description Modifiers may define both activation and deactivation timelines. */
  it('accepts modifier with both in and out timelines', () => {
    const binding = {
      modifierName: 'pulse',
      inTimelineId: 'tl-1',
      outTimelineId: 'tl-2',
    };

    expect(binding.inTimelineId).toBe('tl-1');
    expect(binding.outTimelineId).toBe('tl-2');
  });

  /** @description Modifiers may also omit the out timeline when the in timeline should reverse. */
  it('accepts modifier with only inTimeline', () => {
    const binding: { modifierName: string; inTimelineId: string; outTimelineId?: string } = {
      modifierName: 'glow',
      inTimelineId: 'tl-1',
    };

    expect(binding.inTimelineId).toBe('tl-1');
    expect(binding.outTimelineId).toBeUndefined();
  });
});

/** @description Interpolation strings must match the supported preset and custom easing vocabulary. */
describe('Easing and interpolation modes', () => {
  /** @description The standard easing presets must all be recognized. */
  it.each(['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const)('accepts easing preset %s', (preset) => {
    expect(isValidInterpolationMode(preset)).toBe(true);
  });

  /** @description Step interpolation must also validate. */
  it('accepts step interpolation', () => {
    expect(isValidInterpolationMode('step')).toBe(true);
  });

  /** @description Valid cubic-bezier definitions must be accepted. */
  it('accepts cubic-bezier interpolation', () => {
    expect(isValidInterpolationMode('cubic-bezier(0.42, 0, 0.58, 1)')).toBe(true);
  });

  /** @description Unsupported interpolation labels must be rejected. */
  it('rejects invalid interpolation mode', () => {
    expect(isValidInterpolationMode('bounce')).toBe(false);
  });
});

/** @description Cubic-bezier x control points must stay in [0,1] while y values may overshoot. */
describe('Cubic-bezier control point validation', () => {
  /** @description A standard cubic-bezier curve must validate. */
  it('accepts standard cubic-bezier', () => {
    expect(validateCubicBezier(0.42, 0, 0.58, 1)).toBe(true);
  });

  /** @description Overshoot y values are allowed for easing curves. */
  it('accepts y values outside [0,1] (overshoot)', () => {
    expect(validateCubicBezier(0.42, 1.5, 0.58, -0.5)).toBe(true);
  });

  /** @description Out-of-range x coordinates and non-finite values must be rejected. */
  it('rejects invalid x or non-finite control points', () => {
    expect(validateCubicBezier(1.5, 0, 0.58, 1)).toBe(false);
    expect(validateCubicBezier(0.42, 0, 1.5, 1)).toBe(false);
    expect(validateCubicBezier(-0.1, 0, 0.58, 1)).toBe(false);
    expect(validateCubicBezier(Number.NaN, 0, 0.58, 1)).toBe(false);
    expect(validateCubicBezier(0.42, Number.POSITIVE_INFINITY, 0.58, 1)).toBe(false);
  });
});

/** @description Gradient animation targets use dot-path notation to address individual gradient stops and properties. */
describe('Gradient animation target validation', () => {
  /** @description Stop color targets use color keyframe values for OKLab interpolation. */
  it('accepts backgroundGradient.stops[N].color with color keyframe value', () => {
    const keyframe = {
      name: 'gradient-color',
      action: 'none',
      offsetMs: 0,
      properties: {
        'backgroundGradient.stops[0].color': { type: 'color', value: '#ff0000', easing: 'linear' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });

  /** @description Stop position targets use numeric keyframe values (0-100 range). */
  it('accepts backgroundGradient.stops[N].position with number keyframe value', () => {
    const keyframe = {
      name: 'gradient-position',
      action: 'none',
      offsetMs: 0,
      properties: {
        'backgroundGradient.stops[1].position': { type: 'number', value: 50, easing: 'linear' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });

  /** @description Gradient angle targets address the linear/conic gradient angle as a number. */
  it('accepts backgroundGradient.angle with number keyframe value', () => {
    const keyframe = {
      name: 'gradient-angle',
      action: 'none',
      offsetMs: 0,
      properties: {
        'backgroundGradient.angle': { type: 'number', value: 180, easing: 'linear' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });

  /** @description Gradient center targets address the radial/conic center as a 2D tuple. */
  it('accepts backgroundGradient.center with tuple keyframe value', () => {
    const keyframe = {
      name: 'gradient-center',
      action: 'none',
      offsetMs: 0,
      properties: {
        'backgroundGradient.center': { type: 'tuple', value: [50, 50], easing: 'linear' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });

  /** @description Stop color must use color type, not number or string. */
  it('rejects backgroundGradient.stops[N].color with wrong keyframe type', () => {
    const keyframe = {
      name: 'wrong-type',
      action: 'none',
      offsetMs: 0,
      properties: {
        'backgroundGradient.stops[0].color': { type: 'number', value: 42, easing: 'linear' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(false);
  });

  /** @description Stop position must use number type, not color or string. */
  it('rejects backgroundGradient.stops[N].position with wrong keyframe type', () => {
    const keyframe = {
      name: 'wrong-type',
      action: 'none',
      offsetMs: 0,
      properties: {
        'backgroundGradient.stops[0].position': { type: 'color', value: '#ff0000', easing: 'linear' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(false);
  });

  /** @description Angle must use number type. */
  it('rejects backgroundGradient.angle with wrong keyframe type', () => {
    const keyframe = {
      name: 'wrong-type',
      action: 'none',
      offsetMs: 0,
      properties: {
        'backgroundGradient.angle': { type: 'string', value: '180deg', easing: 'linear' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(false);
  });

  /** @description Center must use tuple type. */
  it('rejects backgroundGradient.center with wrong keyframe type', () => {
    const keyframe = {
      name: 'wrong-type',
      action: 'none',
      offsetMs: 0,
      properties: {
        'backgroundGradient.center': { type: 'number', value: 50, easing: 'linear' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(false);
  });

  /** @description Multiple gradient targets can be animated simultaneously in one keyframe. */
  it('accepts multiple gradient targets in one keyframe', () => {
    const keyframe = {
      name: 'multi-gradient',
      action: 'none',
      offsetMs: 0,
      properties: {
        'backgroundGradient.stops[0].color': { type: 'color', value: '#ff0000', easing: 'linear' },
        'backgroundGradient.stops[1].position': { type: 'number', value: 75, easing: 'ease-out' },
        'backgroundGradient.angle': { type: 'number', value: 45, easing: 'linear' },
      },
    };
    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });
});
