import { describe, expect, it, jest } from '@jest/globals';

import type { ShadowData, WheelAction } from './utilities';
import {
  buildBoxShadow,
  buildTextShadow,
  buildTimelineOptions,
  classifyWheelInput,
  getModifierBindings,
  getStateBindings,
  normalizeStateBindings,
  parseCssLength,
  parseFilter,
  parseShadow,
  resolveNumber,
  resolveString,
} from './utilities';

// ===========================================================================
// CSS Shadow Parsing and Building
// ===========================================================================

describe('CSS Shadow Parsing and Building', () => {
  /**
   * @description Parsing a box-shadow with px values must extract offsets,
   * blur, spread, and color into a structured object.
   */
  it('parses box-shadow with px values', () => {
    const result = parseShadow('2px 4px 6px 8px rgba(0,0,0,0.5)');

    expect(result.offsetX).toBe(2);
    expect(result.offsetY).toBe(4);
    expect(result.blur).toBe(6);
    expect(result.spread).toBe(8);
    expect(result.color).toBe('rgba(0,0,0,0.5)');
  });

  /**
   * @description Building from structured shadow data must produce a valid
   * CSS box-shadow string including spread and inset.
   */
  it('builds valid box-shadow string', () => {
    const data: ShadowData = {
      offsetX: 2,
      offsetY: 4,
      blur: 6,
      spread: 8,
      color: 'rgba(0,0,0,0.5)',
      inset: false,
    };

    const result = buildBoxShadow(data);

    expect(result).toBe('2px 4px 6px 8px rgba(0,0,0,0.5)');
  });

  /**
   * @description Building as text-shadow must omit spread and inset
   * since those are not valid in text-shadow syntax.
   */
  it('builds text-shadow without spread and inset', () => {
    const data: ShadowData = {
      offsetX: 1,
      offsetY: 2,
      blur: 3,
      spread: 10,
      color: '#000',
      inset: true,
    };

    const result = buildTextShadow(data);

    expect(result).toBe('1px 2px 3px #000');
    expect(result).not.toContain('10px');
    expect(result).not.toContain('inset');
  });
});

// ===========================================================================
// CSS Filter Parsing and Building
// ===========================================================================

describe('CSS Filter Parsing and Building', () => {
  /**
   * @description Parsing multiple CSS filters must return one object per
   * filter function with the function name, numeric value, and unit.
   */
  it('parses multiple filters', () => {
    const result = parseFilter('blur(4px) brightness(1.2)');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ fn: 'blur', value: 4, unit: 'px' });
    expect(result[1]).toEqual({ fn: 'brightness', value: 1.2, unit: '' });
  });

  /**
   * @description Parsing hue-rotate must extract the deg unit.
   */
  it('parses hue-rotate with deg unit', () => {
    const result = parseFilter('hue-rotate(90deg)');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ fn: 'hue-rotate', value: 90, unit: 'deg' });
  });
});

// ===========================================================================
// CSS Length Parsing
// ===========================================================================

describe('CSS Length Parsing', () => {
  /**
   * @description Parsing a CSS length must extract the numeric value and unit.
   */
  it('parses em value', () => {
    const result = parseCssLength('1.5em');

    expect(result).toEqual({ value: 1.5, unit: 'em' });
  });

  /**
   * @description Empty strings must return 0px as the default.
   */
  it('returns 0px for empty string', () => {
    const result = parseCssLength('');

    expect(result).toEqual({ value: 0, unit: 'px' });
  });
});

// ===========================================================================
// Animation Binding Normalization
// ===========================================================================

describe('Animation Binding Normalization', () => {
  /**
   * @description Empty binding maps must produce IN and OUT entries so the
   * UI always has a minimum set of state bindings to display.
   */
  it('produces IN and OUT from empty bindings', () => {
    const result = normalizeStateBindings([]);

    const stateNames = result.map((b) => b.stateName);

    expect(stateNames).toContain('IN');
    expect(stateNames).toContain('OUT');
  });

  /**
   * @description Custom state bindings must be renumbered sequentially to
   * maintain consistent ordering in the UI.
   */
  it('renumbers custom bindings sequentially', () => {
    const bindings = [
      { stateName: 'IN', timelineId: 'tl-1', order: 5 },
      { stateName: 'CUSTOM-A', timelineId: 'tl-2', order: 10 },
      { stateName: 'OUT', timelineId: 'tl-3', order: 20 },
    ];

    const result = normalizeStateBindings(bindings);

    // IN first, OUT last, custom in between — orders sequential
    expect(result[0]?.stateName).toBe('IN');
    expect(result[result.length - 1]?.stateName).toBe('OUT');

    for (let i = 0; i < result.length; i++) {
      expect(result[i]?.order).toBe(i);
    }
  });
});

// ===========================================================================
// Timeline and State Resolution
// ===========================================================================

describe('Timeline and State Resolution', () => {
  /**
   * @description Timeline options built from timelines must be sorted
   * alphabetically by name for consistent dropdown ordering.
   */
  it('sorts timeline options alphabetically', () => {
    const timelines = [
      { id: 'tl-3', name: 'Zoom' },
      { id: 'tl-1', name: 'Alpha' },
      { id: 'tl-2', name: 'Move' },
    ];

    const result = buildTimelineOptions(timelines);

    expect(result.map((o) => o.label)).toEqual(['Alpha', 'Move', 'Zoom']);
  });

  /**
   * @description When the config has no stateTimelineBindings, the accessor
   * must return an empty array instead of undefined.
   */
  it('returns empty array for missing stateTimelineBindings', () => {
    const result = getStateBindings({});

    expect(result).toEqual([]);
  });

  /**
   * @description When the config has no modifierTimelineBindings, the
   * accessor must return an empty array.
   */
  it('returns empty array for missing modifierTimelineBindings', () => {
    const result = getModifierBindings({});

    expect(result).toEqual([]);
  });
});

// ===========================================================================
// Keyframe Value Resolution
// ===========================================================================

describe('Keyframe Value Resolution', () => {
  /**
   * @description When no keyframe adapter exists, resolveNumber must fall
   * back to the element's own value.
   */
  it('returns element value when adapter is null', () => {
    const result = resolveNumber({
      adapter: null,
      property: 'opacity',
      elementValue: 0.8,
    });

    expect(result.value).toBe(0.8);
    expect(result.disabled).toBe(true);
  });

  /**
   * @description A keyframe value of 0 must be preserved and not fall back
   * to the element value. Zero is a valid intentional value.
   */
  it('preserves keyframe zero instead of falling back', () => {
    const result = resolveNumber({
      adapter: { opacity: { value: 0 } },
      property: 'opacity',
      elementValue: 1,
    });

    expect(result.value).toBe(0);
    expect(result.disabled).toBe(false);
  });

  /**
   * @description String properties must be resolved from the keyframe when
   * present, and onChange must route to the adapter callback.
   */
  it('resolves string from keyframe and routes onChange', () => {
    const onChange = jest.fn();
    const result = resolveString({
      adapter: { transform: { value: 'translateX(10px)' } },
      property: 'transform',
      elementValue: 'none',
      onChange,
    });

    expect(result.value).toBe('translateX(10px)');
    expect(result.disabled).toBe(false);

    result.onChange('translateY(5px)');

    expect(onChange).toHaveBeenCalledWith('transform', 'translateY(5px)');
  });
});

// ===========================================================================
// Wheel Input Classification
// ===========================================================================

describe('Wheel Input Classification', () => {
  /**
   * @description Smooth pixel deltas without modifiers indicate a trackpad
   * pan gesture.
   */
  it('classifies smooth delta without modifiers as pan', () => {
    const result = classifyWheelInput({
      deltaX: 10,
      deltaY: 20,
      deltaMode: 0, // WheelEvent.DOM_DELTA_PIXEL
      ctrlKey: false,
      altKey: false,
    });

    expect(result).toBe('pan' satisfies WheelAction);
  });

  /**
   * @description Smooth pixel delta with Alt key held indicates a trackpad
   * zoom gesture.
   */
  it('classifies smooth delta with Alt as zoom', () => {
    const result = classifyWheelInput({
      deltaX: 0,
      deltaY: 10,
      deltaMode: 0,
      ctrlKey: false,
      altKey: true,
    });

    expect(result).toBe('zoom' satisfies WheelAction);
  });

  /**
   * @description Ctrl+wheel (browser-reported pinch gesture) must be
   * classified as zoom regardless of deltaMode.
   */
  it('classifies Ctrl+wheel as zoom (pinch)', () => {
    const result = classifyWheelInput({
      deltaX: 0,
      deltaY: -5,
      deltaMode: 0,
      ctrlKey: true,
      altKey: false,
    });

    expect(result).toBe('zoom' satisfies WheelAction);
  });
});
