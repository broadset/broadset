/** @jest-environment jsdom */

import type { Keyframe } from '@broadset/model';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import type { PerPropertyLanesProps } from './timeline';
import { defaultPerPropertyLanesProps, loadTimelineTestModules, makePropertyKeyframe } from './timeline-test-helpers';

let PerPropertyLanes: React.ComponentType<PerPropertyLanesProps>;

beforeAll(async () => {
  const mod = await loadTimelineTestModules();

  PerPropertyLanes = mod.PerPropertyLanes;
});

describe('PerPropertyLanes', () => {
  /**
   * @description When expanded with animated properties, the component MUST
   * render individual lanes for each property with keyframe markers.
   */
  it('renders property lanes with per-property keyframe markers', () => {
    const keyframes: readonly Keyframe[] = [
      makePropertyKeyframe({
        name: 'kf-1',
        offsetMs: 0,
        properties: {
          x: { type: 'number', value: 0, easing: 'linear' },
          opacity: { type: 'number', value: 1, easing: 'ease' },
        },
      }),
      makePropertyKeyframe({
        name: 'kf-2',
        offsetMs: 1000,
        properties: {
          x: { type: 'number', value: 100, easing: 'linear' },
          opacity: { type: 'number', value: 0.5, easing: 'ease' },
        },
      }),
    ];
    const props = defaultPerPropertyLanesProps({ keyframes });

    render(<PerPropertyLanes {...props} />);

    // Should have property lane headings
    expect(screen.getByText('x')).toBeDefined();
    expect(screen.getByText('opacity')).toBeDefined();

    // Each lane should have markers
    const lanes = screen.getAllByTestId('property-lane');

    expect(lanes.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * @description Double-clicking on a property lane at a specific offset MUST
   * call onAddPropertyKeyframe with the offset and property name.
   */
  it('creates a property keyframe on double-click', () => {
    const keyframes: readonly Keyframe[] = [
      makePropertyKeyframe({
        offsetMs: 0,
        properties: {
          opacity: { type: 'number', value: 1, easing: 'ease' },
        },
      }),
    ];
    const props = defaultPerPropertyLanesProps({ keyframes, durationMs: 3000 });

    render(<PerPropertyLanes {...props} />);

    const lanes = screen.getAllByTestId('property-lane');

    expect(lanes[0]).toBeDefined();

    const lane = lanes[0] as HTMLElement;

    // Double-click in the middle of the lane
    fireEvent.doubleClick(lane, { clientX: 150 });

    expect(props.onAddPropertyKeyframe).toHaveBeenCalledWith(expect.any(Number), expect.any(String));
  });

  /**
   * @description Dragging a property keyframe marker to a new offset MUST call
   * onMovePropertyKeyframe to move that property independently.
   */
  it('moves a property keyframe via drag', () => {
    const keyframes: readonly Keyframe[] = [
      makePropertyKeyframe({
        name: 'kf-1',
        offsetMs: 300,
        properties: {
          x: { type: 'number', value: 100, easing: 'linear' },
          opacity: { type: 'number', value: 0.5, easing: 'ease' },
        },
      }),
    ];
    const props = defaultPerPropertyLanesProps({ keyframes, durationMs: 3000 });

    render(<PerPropertyLanes {...props} />);

    const markers = screen.getAllByTestId('property-keyframe-marker');

    expect(markers.length).toBeGreaterThanOrEqual(1);

    expect(markers[0]).toBeDefined();

    const marker = markers[0] as HTMLElement;

    fireEvent.pointerDown(marker, { clientX: 30, pointerId: 1 });
    fireEvent.pointerMove(marker, { clientX: 180, pointerId: 1 });
    fireEvent.pointerUp(marker, { clientX: 180, pointerId: 1 });

    expect(props.onMovePropertyKeyframe).toHaveBeenCalled();
  });

  /**
   * @description The component MUST group property lanes by category:
   * Geometry (x, y, width, height, rotation), Appearance (opacity, backgroundColor, etc.),
   * Typography (fontSize, color, etc.).
   */
  it('groups properties by category', () => {
    const keyframes: readonly Keyframe[] = [
      makePropertyKeyframe({
        offsetMs: 0,
        properties: {
          x: { type: 'number', value: 0, easing: 'linear' },
          y: { type: 'number', value: 0, easing: 'linear' },
          opacity: { type: 'number', value: 1, easing: 'ease' },
          fontSize: { type: 'number', value: 14, easing: 'ease' },
        },
      }),
    ];
    const props = defaultPerPropertyLanesProps({ keyframes });

    render(<PerPropertyLanes {...props} />);

    // Category headings must be present
    expect(screen.getByText('Geometry')).toBeDefined();
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('Typography')).toBeDefined();
  });

  /**
   * @description The collapse toggle MUST return the view to the standard
   * monolithic keyframe display — property lanes should disappear.
   */
  it('collapses property lanes via collapse toggle', () => {
    const keyframes: readonly Keyframe[] = [
      makePropertyKeyframe({
        offsetMs: 0,
        properties: {
          x: { type: 'number', value: 0, easing: 'linear' },
          opacity: { type: 'number', value: 1, easing: 'ease' },
        },
      }),
    ];
    const props = defaultPerPropertyLanesProps({ keyframes, isExpanded: true });

    const { rerender } = render(<PerPropertyLanes {...props} />);

    // Lanes are initially present
    expect(screen.getAllByTestId('property-lane').length).toBeGreaterThanOrEqual(1);

    // Collapse — rerender with isExpanded=false
    rerender(<PerPropertyLanes {...{ ...props, isExpanded: false }} />);

    expect(screen.queryAllByTestId('property-lane')).toHaveLength(0);
  });

  /**
   * @description Only one element's property lanes can be expanded at a time.
   * The component enforces this via its controlled isExpanded prop.
   * When isExpanded is false, no lanes should be rendered.
   */
  it('renders no lanes when isExpanded is false', () => {
    const keyframes: readonly Keyframe[] = [
      makePropertyKeyframe({
        offsetMs: 0,
        properties: {
          x: { type: 'number', value: 0, easing: 'linear' },
        },
      }),
    ];
    const props = defaultPerPropertyLanesProps({ keyframes, isExpanded: false });

    render(<PerPropertyLanes {...props} />);

    expect(screen.queryAllByTestId('property-lane')).toHaveLength(0);
  });

  /**
   * @description Per-property keyframe markers MUST appear at the correct
   * offsets within their respective lanes — verifying data-offset attribute.
   */
  it('positions markers at correct offsets within lanes', () => {
    const keyframes: readonly Keyframe[] = [
      makePropertyKeyframe({
        offsetMs: 500,
        properties: {
          opacity: { type: 'number', value: 0.8, easing: 'ease' },
        },
      }),
      makePropertyKeyframe({
        offsetMs: 1500,
        properties: {
          opacity: { type: 'number', value: 0.2, easing: 'ease' },
        },
      }),
    ];
    const props = defaultPerPropertyLanesProps({ keyframes, durationMs: 3000 });

    render(<PerPropertyLanes {...props} />);

    const markers = screen.getAllByTestId('property-keyframe-marker');

    expect(markers).toHaveLength(2);
    // Verify each marker has an offset data attribute
    expect(markers[0]?.getAttribute('data-offset-ms')).toBe('500');
    expect(markers[1]?.getAttribute('data-offset-ms')).toBe('1500');
  });
});
