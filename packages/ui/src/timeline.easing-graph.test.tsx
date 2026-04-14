/** @jest-environment jsdom */

import type { EasingMode } from '@broadset/model';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import type { EasingGraphEditorProps } from './timeline';
import { defaultEasingGraphProps, loadTimelineTestModules } from './timeline-test-helpers';

let EasingGraphEditor: React.ComponentType<EasingGraphEditorProps>;

beforeAll(async () => {
  const mod = await loadTimelineTestModules();

  EasingGraphEditor = mod.EasingGraphEditor;
});

describe('EasingGraphEditor', () => {
  /**
   * @description When the easing graph editor is rendered with a preset easing,
   * the SVG curve area MUST be visible with the correct preset name displayed.
   */
  it('renders the easing curve area with the current preset', () => {
    const props = defaultEasingGraphProps({ easing: 'ease-in-out' });

    render(<EasingGraphEditor {...props} />);

    expect(screen.getByTestId('easing-graph-canvas')).toBeDefined();
    // The preset row should show the preset chips
    expect(screen.getByRole('button', { name: /linear/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /ease-in-out/i })).toBeDefined();
  });

  /**
   * @description Clicking a preset chip MUST immediately call onChange
   * with the preset easing mode value.
   */
  it('applies a preset chip on click', () => {
    const props = defaultEasingGraphProps({ easing: 'linear' });

    render(<EasingGraphEditor {...props} />);

    // Use exact match to avoid matching "ease-in-out" too
    fireEvent.click(screen.getByRole('button', { name: 'ease-in' }));

    expect(props.onChange).toHaveBeenCalledWith('ease-in');
  });

  /**
   * @description For cubic-bezier curves, the graph editor MUST render two
   * draggable control handles and display the curve. Dragging a handle MUST
   * call onChange with a new cubic-bezier easing string.
   */
  it('renders draggable control handles for cubic-bezier curve', () => {
    const props = defaultEasingGraphProps({
      easing: 'cubic-bezier(0.42, 0, 0.58, 1)' as EasingMode,
    });

    render(<EasingGraphEditor {...props} />);

    const handles = screen.getAllByTestId('bezier-handle');

    expect(handles).toHaveLength(2);
  });

  /**
   * @description Dragging a cubic-bezier control handle MUST update the
   * interpolation mode with the new handle positions.
   */
  it('calls onChange when a cubic-bezier handle is dragged', () => {
    const props = defaultEasingGraphProps({
      easing: 'cubic-bezier(0.42, 0, 0.58, 1)' as EasingMode,
    });

    render(<EasingGraphEditor {...props} />);

    const handles = screen.getAllByTestId('bezier-handle');

    expect(handles[0]).toBeDefined();

    const handle = handles[0] as HTMLElement;

    // Simulate drag sequence
    fireEvent.pointerDown(handle, { clientX: 50, clientY: 50 });
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 40 });
    fireEvent.pointerUp(handle, { clientX: 60, clientY: 40 });

    expect(props.onChange).toHaveBeenCalledWith(expect.stringMatching(/^cubic-bezier\(/));
  });

  /**
   * @description When a spring easing is selected (e.g. spring-bouncy),
   * the graph MUST render a spring decay curve indicator so the user can
   * see values above 1.0 (overshoot).
   */
  it('displays spring curve indicator for spring presets', () => {
    const props = defaultEasingGraphProps({ easing: 'spring-bouncy' });

    render(<EasingGraphEditor {...props} />);

    expect(screen.getByTestId('spring-curve-indicator')).toBeDefined();
  });

  /**
   * @description During playback or scrubbing, a preview dot MUST be visible
   * on the curve at the current playback progress position.
   */
  it('shows a preview dot during playback', () => {
    const props = defaultEasingGraphProps({
      isPlaying: true,
      playbackProgress: 0.5,
    });

    render(<EasingGraphEditor {...props} />);

    expect(screen.getByTestId('preview-dot')).toBeDefined();
  });

  /**
   * @description The preview dot MUST NOT be visible when not playing and
   * playbackProgress is 0 (idle state).
   */
  it('hides the preview dot when idle', () => {
    const props = defaultEasingGraphProps({
      isPlaying: false,
      playbackProgress: 0,
    });

    render(<EasingGraphEditor {...props} />);

    expect(screen.queryByTestId('preview-dot')).toBeNull();
  });

  /**
   * @description When the close callback is provided and triggered,
   * the graph editor MUST invoke onClose (e.g. for click-outside behavior).
   */
  it('invokes onClose callback when provided', () => {
    const onClose = jest.fn<() => void>();
    const props = defaultEasingGraphProps({ onClose });

    render(<EasingGraphEditor {...props} />);

    const closeButton = screen.getByRole('button', { name: /close/i });

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * @description Named presets (ease, ease-in, etc.) MUST display the curve
   * as read-only — no control handles should be rendered.
   */
  it('renders named preset curves as read-only (no bezier handles)', () => {
    const props = defaultEasingGraphProps({ easing: 'ease' });

    render(<EasingGraphEditor {...props} />);

    expect(screen.queryAllByTestId('bezier-handle')).toHaveLength(0);
  });

  /**
   * @description Clicking outside the graph editor MUST close it by invoking onClose.
   * The spec requires "The graph editor closes when clicking outside it."
   */
  it('closes on click outside via document mousedown', () => {
    const onClose = jest.fn<() => void>();
    const props = defaultEasingGraphProps({ onClose });

    render(
      <div>
        <div data-testid="outside-element">outside</div>
        <EasingGraphEditor {...props} />
      </div>,
    );

    // Click outside the graph editor
    fireEvent.mouseDown(screen.getByTestId('outside-element'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * @description Clicking inside the graph editor MUST NOT close it.
   */
  it('does not close when clicking inside', () => {
    const onClose = jest.fn<() => void>();
    const props = defaultEasingGraphProps({ onClose });

    render(<EasingGraphEditor {...props} />);

    // Click inside the graph editor
    fireEvent.mouseDown(screen.getByTestId('easing-graph-editor'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
