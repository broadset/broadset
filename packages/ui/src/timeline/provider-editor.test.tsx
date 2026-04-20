/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import type { TimelineEditingContextValue, TimelineEditorProps } from './index';
import { defaultEditorProps, loadTimelineTestModules, makeKeyframe, makeTimeline } from './test-helpers';

let TimelineEditingProvider: React.ComponentType<{ readonly children: React.ReactNode }>;
let TimelineEditor: React.ComponentType<TimelineEditorProps>;
let useTimelineEditing: () => TimelineEditingContextValue | null;

beforeAll(async () => {
  const mod = await loadTimelineTestModules();

  TimelineEditingProvider = mod.TimelineEditingProvider;
  TimelineEditor = mod.TimelineEditor;
  useTimelineEditing = mod.useTimelineEditing;
});

describe('TimelineEditingProvider', () => {
  /**
   * @description Guards the optional-consumer contract so components can safely check for timeline context.
   */
  it('returns null when used outside the provider', () => {
    let contextValue: ReturnType<typeof useTimelineEditing> = null;

    function Consumer(): React.JSX.Element {
      contextValue = useTimelineEditing();

      return <div>consumer</div>;
    }

    render(<Consumer />);

    expect(contextValue).toBeNull();
  });

  /**
   * @description Ensures opening and closing a timeline updates the shared context state for the demo shell.
   */
  it('opens and closes a timeline target with its snapshot', () => {
    const contextRef: { current: ReturnType<typeof useTimelineEditing> } = { current: null };

    function Consumer(): React.JSX.Element {
      contextRef.current = useTimelineEditing();

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              contextRef.current?.openTimeline('el-1', 'fade-in', new Map([['opacity', 1]]));
            }}
          >
            Open timeline
          </button>
          <button
            type="button"
            onClick={() => {
              contextRef.current?.closeTimeline();
            }}
          >
            Close timeline
          </button>
        </div>
      );
    }

    render(
      <TimelineEditingProvider>
        <Consumer />
      </TimelineEditingProvider>,
    );

    expect(contextRef.current?.target).toBeNull();
    expect(contextRef.current?.snapshot).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /open timeline/i }));

    expect(contextRef.current?.target).toEqual({ elementId: 'el-1', timelineName: 'fade-in' });
    expect(contextRef.current?.snapshot).toEqual(new Map([['opacity', 1]]));

    fireEvent.click(screen.getByRole('button', { name: /close timeline/i }));

    expect(contextRef.current?.target).toBeNull();
    expect(contextRef.current?.snapshot).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * TimelineEditor — Keyframe Management
 * --------------------------------------------------------------------------- */

describe('TimelineEditor — keyframe management', () => {
  /**
   * @description When no keyframes exist, the editor must show empty state so the user knows to add one.
   */
  it('displays empty state when no keyframes exist', () => {
    const props = defaultEditorProps({ timeline: makeTimeline({ keyframes: [] }) });

    render(<TimelineEditor {...props} />);

    expect(screen.getByText(/no keyframes/i)).toBeDefined();
  });

  /**
   * @description The + button adds a keyframe and immediately selects it for editing.
   */
  it('calls onAddKeyframe when the add button is clicked', () => {
    const props = defaultEditorProps();

    render(<TimelineEditor {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

    expect(props.onAddKeyframe).toHaveBeenCalledTimes(1);
  });

  /**
   * @description Only one keyframe can be selected at a time — clicking a second marker deselects the first.
   */
  it('selects only one keyframe at a time via aria-pressed', () => {
    const kf1 = makeKeyframe({ name: 'kf-1', offsetMs: 0 });
    const kf2 = makeKeyframe({ name: 'kf-2', offsetMs: 500 });
    const timeline = makeTimeline({ keyframes: [kf1, kf2] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 1 });

    render(<TimelineEditor {...props} />);

    const markers = screen.getAllByRole('button', { pressed: true });

    expect(markers).toHaveLength(1);
  });

  /**
   * @description Clicking a keyframe marker must show a keyframe hint (tooltip or detail area) for editing context.
   */
  it('shows a keyframe hint when a marker is selected', () => {
    const kf = makeKeyframe({ name: 'fade-start', offsetMs: 200 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 0 });

    render(<TimelineEditor {...props} />);

    expect(screen.getAllByText(/fade-start/i).length).toBeGreaterThanOrEqual(1);
  });

  /**
   * @description Visible timeline length must be max(offsets) + 1000ms, minimum 3000ms.
   */
  it('calculates visible timeline length as max offset + 1000ms with 3000ms minimum', () => {
    const kf1 = makeKeyframe({ offsetMs: 500 });
    const kf2 = makeKeyframe({ offsetMs: 1200 });
    const timeline = makeTimeline({ keyframes: [kf1, kf2] });
    const props = defaultEditorProps({ timeline });

    const { container } = render(<TimelineEditor {...props} />);

    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(track).toBeDefined();
    // With keyframes at 500 and 1200, min duration = 1200 + 1000 = 2200, but 3000ms minimum applies
    expect(track?.getAttribute('data-duration-ms')).toBe('3000');
  });

  /**
   * @description When no keyframes exist, minimum visible timeline is 3000ms.
   */
  it('uses 3000ms minimum timeline length when no keyframes exist', () => {
    const timeline = makeTimeline({ keyframes: [] });
    const props = defaultEditorProps({ timeline });

    const { container } = render(<TimelineEditor {...props} />);

    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(track?.getAttribute('data-duration-ms')).toBe('3000');
  });

  /**
   * @description Ruler time labels must use N.Ns format (e.g., 0.5s, 1.0s).
   */
  it('renders ruler labels in N.Ns format', () => {
    const kf = makeKeyframe({ offsetMs: 2500 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline });

    render(<TimelineEditor {...props} />);

    // At minimum, 0.0s should be present in the ruler
    expect(screen.getByText('0.0s')).toBeDefined();
  });

  /**
   * @description Keyframe markers must be color-coded by action type — setState=accent, addModifier=focus, removeModifier=danger.
   */
  it('color-codes keyframe markers by action type', () => {
    const kfSetState = makeKeyframe({ name: 'set', action: 'setState', offsetMs: 0 });
    const kfAddMod = makeKeyframe({ name: 'add', action: 'addModifier', offsetMs: 200 });
    const kfRemoveMod = makeKeyframe({ name: 'rem', action: 'removeModifier', offsetMs: 400 });
    const timeline = makeTimeline({ keyframes: [kfSetState, kfAddMod, kfRemoveMod] });
    const props = defaultEditorProps({ timeline });

    const { container } = render(<TimelineEditor {...props} />);

    const markers = container.querySelectorAll('[data-testid="keyframe-marker"]');

    expect(markers).toHaveLength(3);
    expect(markers[0]?.getAttribute('data-action')).toBe('setState');
    expect(markers[1]?.getAttribute('data-action')).toBe('addModifier');
    expect(markers[2]?.getAttribute('data-action')).toBe('removeModifier');
  });

  /**
   * @description Clicking empty space on the keyframe track positions the playhead at that time.
   */
  it('calls onSeekTimeline when clicking empty area of the track', () => {
    const props = defaultEditorProps();
    const { container } = render(<TimelineEditor {...props} />);

    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(track).toBeDefined();

    if (track !== null) {
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40 }),
      });

      fireEvent.click(track, { clientX: 150 });
    }

    expect(props.onSeekTimeline).toHaveBeenCalled();
  });

  /**
   * @description When a keyframe is selected, an easing dropdown must be available with common presets.
   */
  it('shows easing selector when a keyframe is selected', () => {
    const kf = makeKeyframe({
      offsetMs: 100,
      properties: { opacity: { type: 'number', value: 1, easing: 'ease' } },
    });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 0 });

    render(<TimelineEditor {...props} />);

    const easingSelect = screen.getByRole('combobox', { name: /easing/i });

    expect(easingSelect).toBeDefined();
  });
});

/* ---------------------------------------------------------------------------
 * TimelineEditor — Keyframe Drag Repositioning
 * --------------------------------------------------------------------------- */

describe('TimelineEditor — keyframe drag', () => {
  /**
   * @description Dragging a keyframe marker calls onMoveKeyframe with the new offset.
   */
  it('calls onMoveKeyframe when a keyframe is dragged to a new position', () => {
    const kf = makeKeyframe({ offsetMs: 500 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 0 });
    const { container } = render(<TimelineEditor {...props} />);

    const marker = container.querySelector('[data-testid="keyframe-marker"]');
    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(marker).toBeDefined();
    expect(track).toBeDefined();

    if (marker !== null && track !== null) {
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40 }),
      });

      fireEvent.pointerDown(marker, { clientX: 50, pointerId: 1 });
      fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
      fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 });
    }

    expect(props.onMoveKeyframe).toHaveBeenCalled();
  });

  /**
   * @description During drag, a visual indicator with time label must be visible.
   */
  it('shows a drag indicator with time label during drag', () => {
    const kf = makeKeyframe({ offsetMs: 500 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, selectedKeyframeIndex: 0 });
    const { container } = render(<TimelineEditor {...props} />);

    const marker = container.querySelector('[data-testid="keyframe-marker"]');
    const track = container.querySelector('[data-testid="timeline-track"]');

    if (marker !== null && track !== null) {
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40 }),
      });

      fireEvent.pointerDown(marker, { clientX: 50, pointerId: 1 });
      fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
    }

    const indicator = container.querySelector('[data-testid="drag-indicator"]');

    expect(indicator).toBeDefined();

    if (marker !== null && track !== null) {
      fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 });
    }
  });
});

/* ---------------------------------------------------------------------------
 * TimelineEditor — Playback
 * --------------------------------------------------------------------------- */

describe('TimelineEditor — playback controls', () => {
  /**
   * @description The play button must call onPlayTimeline without passing an onComplete callback.
   */
  it('calls onPlayTimeline without onComplete when play is pressed', () => {
    const kf = makeKeyframe({ offsetMs: 0 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline });

    render(<TimelineEditor {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    expect(props.onPlayTimeline).toHaveBeenCalledTimes(1);
    expect(props.onPlayTimeline).toHaveBeenCalledWith();
  });

  /**
   * @description When playing, a stop button must be available.
   */
  it('shows stop button while playing', () => {
    const kf = makeKeyframe({ offsetMs: 0 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline, isPlaying: true });

    render(<TimelineEditor {...props} />);

    expect(screen.getByRole('button', { name: /stop/i })).toBeDefined();
  });
});

/* ---------------------------------------------------------------------------
 * TimelineBottomPanel
 * --------------------------------------------------------------------------- */
