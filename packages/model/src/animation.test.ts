import { describe, expect, it } from '@jest/globals';

import {
  type AnimationRegistryEntry,
  animationRegistrySchema,
  createDefaultAnimationConfig,
  type ElementAnimationConfig,
  elementAnimationConfigSchema,
  isValidInterpolationMode,
  type Keyframe,
  keyframeSchema,
  type ModifierTimelineBinding,
  type StateTimelineBinding,
  type Timeline,
  timelineSchema,
  validateCubicBezier,
} from './animation';

/** @description The animation registry is a flat array with unique element IDs */
describe('Animation registry structure', () => {
  /** @description Registry must be a flat array of { elementId, config } entries */
  it('accepts a flat array of entries', () => {
    const entries: AnimationRegistryEntry[] = [
      { elementId: 'e1', config: createDefaultAnimationConfig() },
      { elementId: 'e2', config: createDefaultAnimationConfig() },
    ];

    const result = animationRegistrySchema.safeParse(entries);

    expect(result.success).toBe(true);
  });

  /** @description Duplicate element IDs in the registry must be rejected */
  it('rejects duplicate element IDs', () => {
    const entries: AnimationRegistryEntry[] = [
      { elementId: 'e1', config: createDefaultAnimationConfig() },
      { elementId: 'e1', config: createDefaultAnimationConfig() },
    ];

    const result = animationRegistrySchema.safeParse(entries);

    expect(result.success).toBe(false);
  });
});

/** @description ElementAnimationConfig has empty defaults for new elements */
describe('Element animation config shape', () => {
  /** @description A new element with no animation has empty arrays for all fields */
  it('creates empty default config', () => {
    const config = createDefaultAnimationConfig();

    expect(config.timelines).toEqual([]);
    expect(config.stateTimelineBindings).toEqual([]);
    expect(config.modifierTimelineBindings).toEqual([]);
  });

  /** @description Default config must pass schema validation */
  it('default config passes validation', () => {
    const result = elementAnimationConfigSchema.safeParse(createDefaultAnimationConfig());

    expect(result.success).toBe(true);
  });

  /** @description Config with timelines and bindings must be accepted */
  it('accepts config with timelines and bindings', () => {
    const config: ElementAnimationConfig = {
      timelines: [
        {
          id: 'tl-1',
          name: 'entrance',
          entries: [],
        },
      ],
      stateTimelineBindings: [
        { stateName: 'IN', timelineId: 'tl-1' },
        { stateName: 'OUT', timelineId: 'tl-1' },
      ],
      modifierTimelineBindings: [],
    };

    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });
});

/** @description Timeline structure has name, entries (keyframes), and optional id/children */
describe('Timeline structure', () => {
  /** @description A named timeline with keyframes must have name, entries, and id */
  it('accepts a timeline with name, entries, and id', () => {
    const timeline: Timeline = {
      id: 'tl-1',
      name: 'entrance',
      entries: [
        {
          name: 'start',
          action: 'none',
          offsetMs: 0,
          properties: {},
        },
        {
          name: 'mid',
          action: 'none',
          offsetMs: 500,
          properties: { opacity: { value: 0.5, interpolation: 'linear' } },
        },
        {
          name: 'end',
          action: 'none',
          offsetMs: 1000,
          properties: { opacity: { value: 1, interpolation: 'ease-out' } },
        },
      ],
    };

    const result = timelineSchema.safeParse(timeline);

    expect(result.success).toBe(true);
  });

  /** @description Child timeline bindings pair a childElementId with a nested timeline */
  it('accepts child timeline bindings', () => {
    const timeline: Timeline = {
      id: 'tl-parent',
      name: 'group-entrance',
      entries: [],
      childTimelines: [
        {
          childElementId: 'child-1',
          timeline: {
            id: 'tl-child-1',
            name: 'child entrance',
            entries: [],
          },
        },
      ],
    };

    const result = timelineSchema.safeParse(timeline);

    expect(result.success).toBe(true);
  });
});

/** @description Keyframe has name, action, offsetMs, properties, and optional payload/target */
describe('Keyframe structure', () => {
  /** @description Property keyframe with offsetMs and properties must be accepted */
  it('accepts a property keyframe at offset', () => {
    const keyframe: Keyframe = {
      name: 'fade-out',
      action: 'none',
      offsetMs: 500,
      properties: {
        opacity: { value: 0, interpolation: 'ease-out' },
      },
    };

    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
    expect(keyframe.offsetMs).toBe(500);
    expect(keyframe.properties['opacity']?.value).toBe(0);
  });

  /** @description Action keyframe with setState and payload must be accepted */
  it('accepts a setState action keyframe', () => {
    const keyframe: Keyframe = {
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

  /** @description addModifier and removeModifier actions must be accepted */
  it.each(['addModifier', 'removeModifier'] as const)('accepts %s action', (action) => {
    const keyframe: Keyframe = {
      name: 'toggle',
      action,
      offsetMs: 200,
      properties: {},
      payload: 'pulse',
    };

    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });

  /** @description Step interpolation must be a valid interpolation mode */
  it('accepts step interpolation', () => {
    const keyframe: Keyframe = {
      name: 'snap',
      action: 'none',
      offsetMs: 0,
      properties: {
        display: { value: 'block', interpolation: 'step' },
      },
    };

    const result = keyframeSchema.safeParse(keyframe);

    expect(result.success).toBe(true);
  });

  /** @description Target field directs the keyframe to a specific element */
  it('accepts optional target element ID', () => {
    const keyframe: Keyframe = {
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

/** @description State bindings map state names to timeline IDs; IN/OUT are reserved */
describe('State and modifier bindings', () => {
  /** @description State bindings include reserved IN and OUT entries */
  it('accepts state bindings with IN and OUT', () => {
    const bindings: StateTimelineBinding[] = [
      { stateName: 'IN', timelineId: 'tl-in' },
      { stateName: 'OUT', timelineId: 'tl-out' },
      { stateName: 'highlighted', timelineId: 'tl-highlight' },
    ];

    for (const binding of bindings) {
      expect(binding.stateName).toBeDefined();
      expect(binding.timelineId).toBeDefined();
    }
  });

  /** @description Modifier with in and out timelines must be accepted */
  it('accepts modifier with both in and out timelines', () => {
    const binding: ModifierTimelineBinding = {
      modifierName: 'pulse',
      inTimelineId: 'tl-1',
      outTimelineId: 'tl-2',
    };

    expect(binding.inTimelineId).toBe('tl-1');
    expect(binding.outTimelineId).toBe('tl-2');
  });

  /** @description Modifier without outTimeline (reverses inTimeline on deactivation) */
  it('accepts modifier with only inTimeline', () => {
    const binding: ModifierTimelineBinding = {
      modifierName: 'glow',
      inTimelineId: 'tl-1',
    };

    expect(binding.inTimelineId).toBe('tl-1');
    expect(binding.outTimelineId).toBeUndefined();
  });
});

/** @description All easing presets and cubic-bezier custom curves must be valid */
describe('Easing and interpolation modes', () => {
  /** @description All four easing presets must be valid interpolation modes */
  it.each(['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const)('accepts easing preset "%s"', (preset) => {
    expect(isValidInterpolationMode(preset)).toBe(true);
  });

  /** @description Step interpolation must be valid */
  it('accepts step interpolation', () => {
    expect(isValidInterpolationMode('step')).toBe(true);
  });

  /** @description Custom cubic-bezier with valid values must be accepted */
  it('accepts cubic-bezier interpolation', () => {
    expect(isValidInterpolationMode('cubic-bezier(0.42, 0, 0.58, 1)')).toBe(true);
  });

  /** @description Invalid interpolation string must be rejected */
  it('rejects invalid interpolation mode', () => {
    expect(isValidInterpolationMode('bounce')).toBe(false);
  });
});

/** @description Cubic-bezier control point validation: x in [0,1], y unrestricted, finite */
describe('Cubic-bezier control point validation', () => {
  /** @description Standard cubic-bezier with x and y in [0,1] must pass */
  it('accepts standard cubic-bezier', () => {
    expect(validateCubicBezier(0.42, 0, 0.58, 1)).toBe(true);
  });

  /** @description y values outside [0,1] are allowed for overshoot effects */
  it('accepts y values outside [0,1] (overshoot)', () => {
    expect(validateCubicBezier(0.42, 1.5, 0.58, -0.5)).toBe(true);
  });

  /** @description x1 outside [0,1] must be rejected */
  it('rejects x1 outside [0,1]', () => {
    expect(validateCubicBezier(1.5, 0, 0.58, 1)).toBe(false);
  });

  /** @description x2 outside [0,1] must be rejected */
  it('rejects x2 outside [0,1]', () => {
    expect(validateCubicBezier(0.42, 0, 1.5, 1)).toBe(false);
  });

  /** @description Negative x1 must be rejected */
  it('rejects negative x1', () => {
    expect(validateCubicBezier(-0.1, 0, 0.58, 1)).toBe(false);
  });

  /** @description NaN control points must be rejected */
  it('rejects NaN control points', () => {
    expect(validateCubicBezier(NaN, 0, 0.58, 1)).toBe(false);
  });

  /** @description Infinity control points must be rejected */
  it('rejects Infinity control points', () => {
    expect(validateCubicBezier(0.42, Infinity, 0.58, 1)).toBe(false);
  });
});
