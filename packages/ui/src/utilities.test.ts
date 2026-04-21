import { describe, expect, it, vi } from 'vitest';

import {
  buildBoxShadow,
  buildFilter,
  buildTextShadow,
  buildTimelineOptions,
  classifyWheelDevice,
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

describe('CSS shadow helpers', () => {
  /** @description Box-shadow parsing must preserve each numeric segment and the color so the properties panel can round-trip existing styles. */
  it('parses a box shadow string into structured values', () => {
    expect(parseShadow('2px 4px 6px 8px rgba(0,0,0,0.5)')).toEqual({
      offsetX: 2,
      offsetY: 4,
      blur: 6,
      spread: 8,
      color: 'rgba(0,0,0,0.5)',
      inset: false,
    });
  });

  /** @description Shadow builders must emit valid CSS so edited values can be written back to element styles without extra formatting logic. */
  it('builds valid box-shadow and text-shadow strings', () => {
    const shadow = {
      offsetX: 2,
      offsetY: 4,
      blur: 6,
      spread: 8,
      color: 'rgba(0,0,0,0.5)',
      inset: true,
    } as const;

    expect(buildBoxShadow(shadow)).toBe('inset 2px 4px 6px 8px rgba(0,0,0,0.5)');
    expect(buildTextShadow(shadow)).toBe('2px 4px 6px rgba(0,0,0,0.5)');
  });
});

describe('CSS filter and length helpers', () => {
  /** @description Filter parsing must split multiple functions so UI editors can expose each filter as an independent control. */
  it('parses and rebuilds CSS filters', () => {
    expect(parseFilter('blur(4px) brightness(1.2)')).toEqual([
      { fn: 'blur', value: 4, unit: 'px' },
      { fn: 'brightness', value: 1.2, unit: '' },
    ]);

    expect(
      buildFilter([
        { fn: 'hue-rotate', value: 90, unit: 'deg' },
        { fn: 'blur', value: 3, unit: 'px' },
      ]),
    ).toBe('hue-rotate(90deg) blur(3px)');
  });

  /** @description CSS lengths must preserve both numeric value and unit so fields like width, padding, and letter-spacing remain editable. */
  it('parses CSS lengths including empty fallbacks', () => {
    expect(parseCssLength('1.5em')).toEqual({ value: 1.5, unit: 'em' });
    expect(parseCssLength('')).toEqual({ value: 0, unit: 'px' });
  });
});

describe('animation binding helpers', () => {
  /** @description State bindings must always expose IN and OUT with predictable ordering so animation configuration stays stable even for sparse input. */
  it('normalizes state bindings and renumbers custom entries sequentially', () => {
    expect(normalizeStateBindings([])).toEqual([
      { stateName: 'IN', timelineId: 'IN', order: 0 },
      { stateName: 'OUT', timelineId: 'OUT', order: 1 },
    ]);

    expect(
      normalizeStateBindings([
        { stateName: 'hover', timelineId: 'timeline-b', order: 99 },
        { stateName: 'OUT', timelineId: 'timeline-out', order: 42 },
      ]),
    ).toEqual([
      { stateName: 'IN', timelineId: 'IN', order: 0 },
      { stateName: 'hover', timelineId: 'timeline-b', order: 1 },
      { stateName: 'OUT', timelineId: 'timeline-out', order: 2 },
    ]);
  });

  /** @description Timeline selectors must be sorted for usability and binding accessors must safely default to empty lists when config is partial. */
  it('sorts timeline options and returns empty binding arrays when absent', () => {
    expect(
      buildTimelineOptions([
        { id: 'b', name: 'Beta' },
        { id: 'a', name: 'Alpha' },
        { id: 'fallback-id', name: '' },
      ]),
    ).toEqual([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'fallback-id', label: 'fallback-id' },
    ]);

    expect(getStateBindings({})).toEqual([]);
    expect(getModifierBindings({})).toEqual([]);
  });
});

describe('keyframe property resolution', () => {
  /** @description Numeric keyframes must preserve explicit zero values instead of falling back to the live element value. */
  it('resolves numbers from the adapter when present and preserves zero', () => {
    expect(resolveNumber({ adapter: null, property: 'x', elementValue: 42 })).toEqual({
      value: 42,
      disabled: false,
    });

    expect(resolveNumber({ adapter: { opacity: { value: 0 } }, property: 'opacity', elementValue: 1 })).toEqual({
      value: 0,
      disabled: false,
    });

    expect(resolveNumber({ adapter: { x: { value: 10 } }, property: 'y', elementValue: 5 })).toEqual({
      value: 5,
      disabled: true,
    });
  });

  /** @description String keyframe resolution must hand property edits back to the adapter so animation mode updates keyframes rather than the base element. */
  it('routes string changes through the adapter callback when included', () => {
    const onChange = vi.fn<(property: string, value: string) => void>();
    const resolved = resolveString({
      adapter: { content: { value: 'Intro' } },
      property: 'content',
      elementValue: 'Fallback',
      onChange,
    });

    expect(resolved.value).toBe('Intro');
    expect(resolved.disabled).toBe(false);

    resolved.onChange('Updated');
    expect(onChange).toHaveBeenCalledWith('content', 'Updated');
  });
});

describe('wheel input classification', () => {
  /** @description Smooth trackpad gestures must classify into pan or zoom so the canvas can react correctly to natural scrolling, pinch gestures, and real mouse-wheel zooming on macOS. */
  it('classifies trackpad pan, alt-zoom, ctrl-pinch, and mouse wheel input', () => {
    expect(classifyWheelInput({ deltaX: 18, deltaY: 12, deltaMode: 0, ctrlKey: false, altKey: false })).toBe('pan');
    expect(classifyWheelInput({ deltaX: 0, deltaY: 20, deltaMode: 0, ctrlKey: false, altKey: true })).toBe('zoom');
    expect(classifyWheelInput({ deltaX: 0, deltaY: -12, deltaMode: 0, ctrlKey: true, altKey: false })).toBe('zoom');
    expect(classifyWheelInput({ deltaX: 0, deltaY: 120, deltaMode: 0, ctrlKey: false, altKey: false })).toBe('zoom');
    expect(classifyWheelInput({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false, altKey: false })).toBe('zoom');
    expect(classifyWheelInput({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: true, altKey: false })).toBe('pan');
    expect(classifyWheelInput({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false, altKey: true })).toBe('pan');
  });

  /** @description On macOS Chrome/Safari, a physical mouse wheel fires pixel-mode events with variable deltaY due to kinetic acceleration. wheelDeltaY is always a multiple of 120 for mouse wheels, so it must take precedence over deltaY magnitude — otherwise tail events with small deltaY would flip from zoom to pan mid-scroll. */
  it('treats Chrome/Safari mouse-wheel pixel-mode events with wheelDeltaY as zoom regardless of accelerated deltaY magnitude', () => {
    const tailEvent = { deltaX: 0, deltaY: -4, deltaMode: 0, ctrlKey: false, altKey: false, wheelDeltaY: 120 };
    const midEvent = { deltaX: 0, deltaY: -40, deltaMode: 0, ctrlKey: false, altKey: false, wheelDeltaY: 120 };
    const burstEvent = { deltaX: 0, deltaY: -220, deltaMode: 0, ctrlKey: false, altKey: false, wheelDeltaY: 360 };

    expect(classifyWheelDevice(tailEvent)).toBe('mouse-wheel');
    expect(classifyWheelDevice(midEvent)).toBe('mouse-wheel');
    expect(classifyWheelDevice(burstEvent)).toBe('mouse-wheel');
    expect(classifyWheelInput(tailEvent)).toBe('zoom');
    expect(classifyWheelInput(midEvent)).toBe('zoom');
    expect(classifyWheelInput(burstEvent)).toBe('zoom');
  });

  /** @description Trackpads produce fractional deltaY and non-120-divisible wheelDeltaY. Those events must classify as trackpad so small vertical swipes pan the canvas instead of zooming. */
  it('classifies trackpad pixel-mode events as trackpad even when deltaY is larger than the pixel-fallback threshold', () => {
    const flickEvent = { deltaX: 0, deltaY: 96.5, deltaMode: 0, ctrlKey: false, altKey: false, wheelDeltaY: -64 };
    const smallEvent = { deltaX: 0, deltaY: 14, deltaMode: 0, ctrlKey: false, altKey: false, wheelDeltaY: -18 };

    expect(classifyWheelDevice(flickEvent)).toBe('trackpad');
    expect(classifyWheelDevice(smallEvent)).toBe('trackpad');
    expect(classifyWheelInput(flickEvent)).toBe('pan');
    expect(classifyWheelInput(smallEvent)).toBe('pan');
  });

  /** @description Mouse wheel + Ctrl/Meta maps to horizontal pan and Mouse wheel + Alt maps to vertical pan per the canvas spec. The classifier must return 'pan' for those cases so the canvas handler routes into the directional-pan branch. */
  it('classifies mouse-wheel modifier combinations as pan so the handler can route directional pans', () => {
    expect(
      classifyWheelInput({ deltaX: 0, deltaY: 120, deltaMode: 0, ctrlKey: true, altKey: false, wheelDeltaY: -120 }),
    ).toBe('pan');
    expect(
      classifyWheelInput({ deltaX: 0, deltaY: 120, deltaMode: 0, ctrlKey: false, altKey: true, wheelDeltaY: -120 }),
    ).toBe('pan');
  });

  /** @description Screen reader mode must opt the canvas out of wheel-driven zoom/pan entirely so assistive tech can use the wheel for document reading. */
  it('returns none when a screen reader is active', () => {
    expect(
      classifyWheelInput({
        altKey: false,
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 120,
        screenReaderActive: true,
      }),
    ).toBe('none');
  });
});
