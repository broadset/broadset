import { describe, expect, it } from '@jest/globals';

import { elementAnimationConfigSchema, keyframeSchema } from './index';

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

/** @description TextAnimator validation ensures stagger config is well-formed and references valid timelines. */
describe('TextAnimator validation', () => {
  const baseTimeline = {
    id: 'tl-char',
    name: 'char-reveal',
    keyframes: [
      {
        name: 'start',
        action: 'none',
        offsetMs: 0,
        properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
      },
      {
        name: 'end',
        action: 'none',
        offsetMs: 200,
        properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
      },
    ],
  };

  /** @description A valid textAnimator with rangeMode characters and matching timelineId must pass validation. */
  it('accepts valid textAnimator with characters rangeMode', () => {
    const config = {
      timelines: [baseTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: { rangeMode: 'characters', staggerDelayMs: 50, randomOrder: false, timelineId: 'tl-char' },
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  /** @description A valid textAnimator with rangeMode words must pass validation. */
  it('accepts textAnimator with words rangeMode', () => {
    const config = {
      timelines: [baseTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: { rangeMode: 'words', staggerDelayMs: 100, randomOrder: false, timelineId: 'tl-char' },
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  /** @description A valid textAnimator with rangeMode lines must pass validation. */
  it('accepts textAnimator with lines rangeMode', () => {
    const config = {
      timelines: [baseTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: { rangeMode: 'lines', staggerDelayMs: 200, randomOrder: true, timelineId: 'tl-char' },
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  /** @description textAnimator.timelineId must reference a timeline that exists in the config. */
  it('rejects textAnimator referencing non-existent timeline', () => {
    const config = {
      timelines: [baseTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: { rangeMode: 'characters', staggerDelayMs: 50, randomOrder: false, timelineId: 'tl-missing' },
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  /** @description staggerDelayMs must be non-negative. */
  it('rejects negative staggerDelayMs', () => {
    const config = {
      timelines: [baseTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: { rangeMode: 'characters', staggerDelayMs: -10, randomOrder: false, timelineId: 'tl-char' },
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  /** @description An invalid rangeMode must be rejected. */
  it('rejects invalid rangeMode', () => {
    const config = {
      timelines: [baseTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: { rangeMode: 'paragraphs', staggerDelayMs: 50, randomOrder: false, timelineId: 'tl-char' },
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  /** @description textAnimator null means no per-character animation and must be valid. */
  it('accepts null textAnimator', () => {
    const config = {
      timelines: [baseTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: null,
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  /** @description Omitted textAnimator defaults to null. */
  it('defaults omitted textAnimator to null', () => {
    const config = {
      timelines: [baseTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.textAnimator).toBeNull();
    }
  });

  /** @description randomOrder defaults to false when omitted. */
  it('defaults randomOrder to false', () => {
    const config = {
      timelines: [baseTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: { rangeMode: 'characters', staggerDelayMs: 50, timelineId: 'tl-char' },
    };
    const result = elementAnimationConfigSchema.safeParse(config);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.textAnimator?.randomOrder).toBe(false);
    }
  });
});
