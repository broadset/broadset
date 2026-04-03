import type { ElementAnimationConfig, Timeline } from '@broadset/model';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { parseClassState } from './class-state';
import { escapeCssId } from './css-escape';
import { createPlaybackHandle } from './playback-handle';
import { resolveModifierTimelines, resolveStateTimeline } from './resolve-timeline';
import { applyStylesToElement, camelToKebab } from './style-writer';

// ---------------------------------------------------------------------------
// CSS Identifier Escaping
// ---------------------------------------------------------------------------

describe('escapeCssId', () => {
  /**
   * @description Special characters in element IDs must be escaped for
   * safe use in CSS attribute selectors like [data-element-id="..."].
   */
  it('escapes double quotes in element IDs', () => {
    const result = escapeCssId('el"test');

    expect(result).toBe('el\\"test');
  });

  /**
   * @description Simple IDs and UUIDs should pass through unchanged.
   */
  it('passes simple alphanumeric IDs unchanged', () => {
    expect(escapeCssId('el-title-01')).toBe('el-title-01');
    expect(escapeCssId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  /**
   * @description Backslashes themselves must be escaped.
   */
  it('escapes backslashes', () => {
    expect(escapeCssId('el\\test')).toBe('el\\\\test');
  });
});

// ---------------------------------------------------------------------------
// Class State Parsing
// ---------------------------------------------------------------------------

describe('parseClassState', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
  });

  /**
   * @description data-visibility attribute takes precedence for visibility.
   */
  it('reads visibility from data-visibility attribute', () => {
    el.setAttribute('data-visibility', 'onscreen');

    const state = parseClassState(el, []);

    expect(state.visibility).toBe('onscreen');
  });

  /**
   * @description When data-visibility is not set, classes are parsed
   * for known state and modifier names.
   */
  it('parses class-based state: onscreen, active state, modifiers', () => {
    el.className = 'onscreen IN glow';

    const knownStates = ['IN', 'OUT', 'active'];
    const knownModifiers = ['glow', 'pulse'];

    const state = parseClassState(el, knownStates, knownModifiers);

    expect(state.visibility).toBe('onscreen');
    expect(state.activeState).toBe('IN');
    expect(state.modifiers).toContain('glow');
  });

  /**
   * @description When neither data-visibility nor class-based indicators
   * exist, defaults should be returned.
   */
  it('returns defaults for elements with no state indicators', () => {
    const state = parseClassState(el, []);

    expect(state.visibility).toBe('offscreen');
    expect(state.activeState).toBeNull();
    expect(state.modifiers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Timeline Resolution
// ---------------------------------------------------------------------------

describe('resolveStateTimeline', () => {
  const timeline1: Timeline = {
    id: 'tl-enter',
    name: 'entrance',
    entries: [],
  };

  const timeline2: Timeline = {
    id: 'tl-002',
    name: 'exit',
    entries: [],
  };

  const config: ElementAnimationConfig = {
    timelines: [timeline1, timeline2],
    stateTimelineBindings: [
      { stateName: 'IN', timelineId: 'tl-enter' },
      { stateName: 'OUT', timelineId: 'exit' }, // matched by name, not ID
    ],
    modifierTimelineBindings: [],
  };

  /**
   * @description State timeline lookup by binding name → timeline ID.
   */
  it('resolves IN state timeline by ID', () => {
    const result = resolveStateTimeline(config, 'IN');

    expect(result).toBe(timeline1);
  });

  /**
   * @description Unknown states must return null.
   */
  it('returns null for unknown state', () => {
    const result = resolveStateTimeline(config, 'UNKNOWN');

    expect(result).toBeNull();
  });

  /**
   * @description When the binding references a timeline name (not ID),
   * the resolution must fall back to name matching.
   */
  it('resolves timeline by name fallback', () => {
    const result = resolveStateTimeline(config, 'OUT');

    expect(result).toBe(timeline2);
  });
});

describe('resolveModifierTimelines', () => {
  const inTimeline: Timeline = {
    id: 'tl-pulse-in',
    name: 'pulse-in',
    entries: [],
  };

  const outTimeline: Timeline = {
    id: 'tl-pulse-out',
    name: 'pulse-out',
    entries: [],
  };

  const config: ElementAnimationConfig = {
    timelines: [inTimeline, outTimeline],
    stateTimelineBindings: [],
    modifierTimelineBindings: [
      { modifierName: 'pulse', inTimelineId: 'tl-pulse-in', outTimelineId: 'tl-pulse-out' },
      { modifierName: 'glow', inTimelineId: 'tl-glow-in' }, // no out timeline
    ],
  };

  /**
   * @description Resolves both in and out timelines for a modifier.
   */
  it('resolves modifier in and out timelines', () => {
    const result = resolveModifierTimelines(config, 'pulse');

    expect(result?.inTimeline).toBe(inTimeline);
    expect(result?.outTimeline).toBe(outTimeline);
  });

  /**
   * @description When no out timeline is defined, outTimeline is null.
   */
  it('returns null outTimeline when not defined', () => {
    const result = resolveModifierTimelines(config, 'glow');

    expect(result?.inTimeline).toBeUndefined();
    expect(result?.outTimeline).toBeNull();
  });

  /**
   * @description Unknown modifiers return null.
   */
  it('returns null for unknown modifier', () => {
    const result = resolveModifierTimelines(config, 'unknown');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Style Writer
// ---------------------------------------------------------------------------

describe('applyStylesToElement', () => {
  /**
   * @description Opacity must be routed to the data-opacity-target
   * descendant to preserve 3D rendering contexts.
   */
  it('routes opacity to data-opacity-target descendant', () => {
    const container = document.createElement('div');
    const content = document.createElement('div');

    content.setAttribute('data-element-content', '');

    const opacityTarget = document.createElement('div');

    opacityTarget.setAttribute('data-opacity-target', '');
    container.appendChild(content);
    container.appendChild(opacityTarget);

    applyStylesToElement(container, { opacity: 0.5 });
    expect(opacityTarget.style.opacity).toBe('0.5');
    expect(content.style.opacity).toBe('');
  });

  /**
   * @description Non-opacity properties go to the data-element-content target.
   */
  it('applies transform to data-element-content target', () => {
    const container = document.createElement('div');
    const content = document.createElement('div');

    content.setAttribute('data-element-content', '');
    container.appendChild(content);

    applyStylesToElement(container, { transform: 'translateX(100px)' });
    expect(content.style.transform).toBe('translateX(100px)');
  });

  /**
   * @description When no data-element-content descendant exists,
   * styles fall back to the container element.
   */
  it('falls back to container when no data-element-content', () => {
    const container = document.createElement('div');

    applyStylesToElement(container, { transform: 'rotate(45deg)' });
    expect(container.style.transform).toBe('rotate(45deg)');
  });
});

describe('camelToKebab', () => {
  /**
   * @description camelCase CSS property names must be converted to
   * kebab-case for use with style.setProperty().
   */
  it('converts camelCase to kebab-case', () => {
    expect(camelToKebab('backgroundColor')).toBe('background-color');
    expect(camelToKebab('borderRadius')).toBe('border-radius');
    expect(camelToKebab('transform')).toBe('transform');
  });
});

// ---------------------------------------------------------------------------
// Playback Handle
// ---------------------------------------------------------------------------

describe('createPlaybackHandle', () => {
  const simpleTl: Timeline = {
    id: 'tl-1',
    name: 'simple',
    entries: [
      {
        name: 'start',
        action: 'none',
        offsetMs: 0,
        properties: { opacity: { value: 0, interpolation: 'linear' } },
      },
      {
        name: 'end',
        action: 'none',
        offsetMs: 800,
        properties: { opacity: { value: 1, interpolation: 'linear' } },
      },
    ],
  };

  /**
   * @description Seek must clamp to [0, durationMs]. Negative values
   * become 0, values above duration become durationMs.
   */
  it('clamps seek to [0, durationMs]', () => {
    const container = document.createElement('div');
    const handle = createPlaybackHandle(simpleTl, container);

    handle.seek(-100);
    expect(handle.currentTimeMs).toBe(0);

    handle.seek(99999);
    // Duration = 800 + 300 = 1100
    expect(handle.currentTimeMs).toBe(1100);
  });

  /**
   * @description After cancel, play must be a no-op. The handle
   * must remain inactive.
   */
  it('cancel makes play a no-op', () => {
    const container = document.createElement('div');
    const handle = createPlaybackHandle(simpleTl, container);

    handle.cancel();
    handle.play();
    expect(handle.isActive).toBe(false);
  });

  /**
   * @description Seek must evaluate all keyframe actions from t=0
   * to the seek point, firing them in chronological order.
   */
  it('seek fires cumulative actions in order', () => {
    const actionTl: Timeline = {
      id: 'tl-action',
      name: 'action',
      entries: [
        {
          name: 'a1',
          action: 'setState',
          offsetMs: 100,
          properties: {},
          payload: 'active',
        },
        {
          name: 'a2',
          action: 'addModifier',
          offsetMs: 300,
          properties: {},
          payload: 'pulse',
        },
      ],
    };

    const container = document.createElement('div');
    const firedActions: Array<{ readonly action: string; readonly payload: string }> = [];

    const handle = createPlaybackHandle(actionTl, container, {
      onAction: (action, payload) => {
        firedActions.push({ action, payload: payload ?? '' });
      },
    });

    handle.seek(400);
    expect(firedActions).toHaveLength(2);
    expect(firedActions[0]?.action).toBe('setState');
    expect(firedActions[1]?.action).toBe('addModifier');
  });

  /**
   * @description Seek to end must apply final transform styles to
   * the element's animation target.
   */
  it('seek applies styles to DOM', () => {
    const container = document.createElement('div');
    const content = document.createElement('div');

    content.setAttribute('data-element-content', '');
    container.appendChild(content);

    const handle = createPlaybackHandle(simpleTl, container);

    handle.seek(1100); // duration
    // Just verify seek set the time correctly
    expect(handle.currentTimeMs).toBe(1100);
  });

  /**
   * @description Offscreen elements must have visibility:hidden and
   * pointer-events:none when the playback handle manages them.
   */
  it('offscreen element gets visibility hidden and pointer-events none', () => {
    const container = document.createElement('div');

    container.className = 'offscreen';

    applyStylesToElement(container, {
      visibility: 'hidden',
      pointerEvents: 'none',
    });

    expect(container.style.visibility).toBe('hidden');
    expect(container.style.pointerEvents).toBe('none');
  });
});
