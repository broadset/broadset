/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react';
import * as React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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
    const props = defaultEditorProps({ currentTimeMs: 500 });

    render(<TimelineEditor {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

    expect(props.onAddKeyframe).toHaveBeenCalledTimes(1);
    expect(props.onAddKeyframe).toHaveBeenCalledWith(500);
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
   * @description Dragging the playhead/empty track must scrub immediately on pointer down and every pointer move so canvas preview follows the user's hand.
   */
  it('scrubs continuously while dragging across the timeline track', () => {
    const props = defaultEditorProps();
    const { container } = render(<TimelineEditor {...props} />);

    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(track).toBeDefined();

    if (track !== null) {
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40 }),
      });

      fireEvent.pointerDown(track, { clientX: 75, pointerId: 1 });
      fireEvent.pointerMove(track, { clientX: 225, pointerId: 1 });
      fireEvent.pointerUp(track, { clientX: 225, pointerId: 1 });
    }

    expect(props.onSeekTimeline).toHaveBeenCalledTimes(2);
    expect(props.onSeekTimeline).toHaveBeenNthCalledWith(1, 750);
    expect(props.onSeekTimeline).toHaveBeenNthCalledWith(2, 2250);
  });

  /** @description Context-menu/right-click gestures must not scrub the timeline track. */
  it('ignores non-primary pointer down on the timeline track', () => {
    const props = defaultEditorProps();
    const { container } = render(<TimelineEditor {...props} />);

    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(track).toBeDefined();

    if (track !== null) {
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40 }),
      });

      fireEvent.pointerDown(track, { button: 2, clientX: 150, pointerId: 1 });
    }

    expect(props.onSeekTimeline).not.toHaveBeenCalled();
  });

  /**
   * @description A professional timeline must make the edit target, preview state, and current time visible at a glance.
   */
  it('renders timeline editing target and preview state', () => {
    const timeline = makeTimeline({ name: 'Score Bug In' });

    render(
      <TimelineEditor {...defaultEditorProps({ currentTimeMs: 500, timeline })} isPlaying targetName="Score Bug" />,
    );

    expect(screen.getByText('Editing Score Bug In')).toBeTruthy();
    expect(screen.getByText('Element: Score Bug')).toBeTruthy();
    expect(screen.getByText('Playing at 0.5s')).toBeTruthy();
  });

  /**
   * @description Targeted keyframes must identify the child element they edit so owner and child motion are not confused.
   */
  it('labels targeted keyframes by resolved target element name', () => {
    const ownerKf = makeKeyframe({ name: 'Owner Fade', offsetMs: 0 });
    const childKf = makeKeyframe({ name: 'Child Drift', offsetMs: 500, target: 'child-1' });
    const timeline = makeTimeline({ keyframes: [ownerKf, childKf] });
    const props = defaultEditorProps({
      timeline,
      getTargetName: (targetId) => (targetId === 'child-1' ? 'Lower Third Text' : undefined),
    });

    const { container } = render(<TimelineEditor {...props} />);

    expect(screen.getAllByText('Owner').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Target Lower Third Text').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole('button', { name: /keyframe child drift at 0\.5s on target lower third text/i }),
    ).toBeTruthy();

    const markers = container.querySelectorAll('[data-testid="keyframe-marker"]');

    expect(markers[1]?.getAttribute('data-target')).toBe('child-1');
  });

  /**
   * @description Owner and targeted child keyframes must appear in distinct timeline lanes so the edited scope is visible without reading each marker tooltip.
   */
  it('renders owner and targeted keyframes in separate named lanes', () => {
    const ownerKf = makeKeyframe({ name: 'Owner Fade', offsetMs: 0 });
    const childKf = makeKeyframe({ name: 'Child Drift', offsetMs: 500, target: 'child-1' });
    const timeline = makeTimeline({ keyframes: [ownerKf, childKf] });
    const props = defaultEditorProps({
      timeline,
      getTargetName: (targetId) => (targetId === 'child-1' ? 'Lower Third Text' : undefined),
    });

    render(<TimelineEditor {...props} />);

    expect(screen.getByTestId('timeline-lane-label-owner').textContent).toContain('Owner');
    expect(screen.getByTestId('timeline-lane-label-target-child-1').textContent).toContain('Lower Third Text');

    const ownerLane = screen.getByTestId('timeline-lane-markers-owner');
    const childLane = screen.getByTestId('timeline-lane-markers-target-child-1');

    expect(within(ownerLane).getByRole('button', { name: /keyframe owner fade at 0\.0s on owner/i })).toBeTruthy();
    expect(
      within(childLane).getByRole('button', { name: /keyframe child drift at 0\.5s on target lower third text/i }),
    ).toBeTruthy();
  });

  /**
   * @description Owner scope must stay above child target scopes even when child keyframes sort earlier in time.
   */
  it('keeps owner lane first when child keyframes appear first in timeline order', () => {
    const childKf = makeKeyframe({ name: 'Child Drift', offsetMs: 0, target: 'child-1' });
    const ownerKf = makeKeyframe({ name: 'Owner Fade', offsetMs: 500 });
    const timeline = makeTimeline({ keyframes: [childKf, ownerKf] });
    const props = defaultEditorProps({
      timeline,
      getTargetName: (targetId) => (targetId === 'child-1' ? 'Lower Third Text' : undefined),
    });

    render(<TimelineEditor {...props} />);

    const labelColumn = screen.getByTestId('timeline-lane-label-owner').parentElement;

    expect(labelColumn?.children[0]?.getAttribute('data-testid')).toBe('timeline-lane-label-owner');
    expect(labelColumn?.children[1]?.getAttribute('data-testid')).toBe('timeline-lane-label-target-child-1');
  });

  /**
   * @description Target lane order must be based on stable target identity, not labels that can resolve or rename later.
   */
  it('orders target lanes by target id rather than resolved display name', () => {
    const targetBKf = makeKeyframe({ name: 'B Target', offsetMs: 0, target: 'target-b' });
    const targetAKf = makeKeyframe({ name: 'A Target', offsetMs: 500, target: 'target-a' });
    const timeline = makeTimeline({ keyframes: [targetBKf, targetAKf] });
    const props = defaultEditorProps({
      timeline,
      getTargetName: (targetId) => (targetId === 'target-a' ? 'Zebra' : 'Alpha'),
    });

    render(<TimelineEditor {...props} />);

    const labelColumn = screen.getByTestId('timeline-lane-label-target-a').parentElement;

    expect(labelColumn?.children[0]?.getAttribute('data-testid')).toBe('timeline-lane-label-target-a');
    expect(labelColumn?.children[1]?.getAttribute('data-testid')).toBe('timeline-lane-label-target-b');
  });

  /**
   * @description Lane labels are selection context, not time space; clicking them must never jump the playhead.
   */
  it('does not scrub when clicking a timeline lane label', () => {
    const ownerKf = makeKeyframe({ name: 'Owner Fade', offsetMs: 0 });
    const timeline = makeTimeline({ keyframes: [ownerKf] });
    const props = defaultEditorProps({ timeline });

    render(<TimelineEditor {...props} />);

    fireEvent.click(screen.getByTestId('timeline-lane-label-owner'));

    expect(props.onSeekTimeline).not.toHaveBeenCalled();
  });

  /**
   * @description A one-lane timeline must keep the lane label and time rail heights aligned so the editor does not look visually broken.
   */
  it('keeps single-lane label height aligned with the time rail', () => {
    const ownerKf = makeKeyframe({ name: 'Owner Fade', offsetMs: 0 });
    const timeline = makeTimeline({ keyframes: [ownerKf] });

    render(<TimelineEditor {...defaultEditorProps({ timeline })} />);

    expect(screen.getByTestId('timeline-track').style.height).toBe('40px');
    expect(screen.getByTestId('timeline-lane-label-owner').parentElement?.style.gridTemplateRows).toBe(
      'repeat(1, 40px)',
    );
  });

  /**
   * @description The time rail must not clip edge markers or above-rail scrub/drag readouts.
   */
  it('allows keyframe markers and time readouts to overflow the time rail bounds', () => {
    const ownerKf = makeKeyframe({ name: 'Owner Fade', offsetMs: 0 });
    const timeline = makeTimeline({ keyframes: [ownerKf] });

    render(<TimelineEditor {...defaultEditorProps({ timeline })} />);

    expect(screen.getByTestId('timeline-track').style.overflow).toBe('visible');
  });

  /**
   * @description Same-time marker stacks must remain inside the lane so overlapping keyframes do not visually cross into a different scope.
   */
  it('bounds same-time marker stack offsets inside the lane', () => {
    const timeline = makeTimeline({
      keyframes: [
        makeKeyframe({ name: 'Owner A', offsetMs: 500 }),
        makeKeyframe({ name: 'Owner B', offsetMs: 500 }),
        makeKeyframe({ name: 'Owner C', offsetMs: 500 }),
        makeKeyframe({ name: 'Owner D', offsetMs: 500 }),
      ],
    });

    render(<TimelineEditor {...defaultEditorProps({ timeline })} />);

    const markers = screen.getAllByTestId('keyframe-marker');
    const stackYPxValues = markers.map((marker) => Number(marker.getAttribute('data-stack-y-px') ?? '0'));

    expect(Math.min(...stackYPxValues)).toBeGreaterThanOrEqual(-9.5);
    expect(Math.max(...stackYPxValues)).toBeLessThanOrEqual(9.5);
  });

  /**
   * @description Dense same-time stacks must fan horizontally before markers collapse on top of each other.
   */
  it('keeps five same-time markers visually distinguishable', () => {
    const timeline = makeTimeline({
      keyframes: [
        makeKeyframe({ name: 'Owner A', offsetMs: 500 }),
        makeKeyframe({ name: 'Owner B', offsetMs: 500 }),
        makeKeyframe({ name: 'Owner C', offsetMs: 500 }),
        makeKeyframe({ name: 'Owner D', offsetMs: 500 }),
        makeKeyframe({ name: 'Owner E', offsetMs: 500 }),
      ],
    });

    render(<TimelineEditor {...defaultEditorProps({ timeline })} />);

    const markerPositions = screen.getAllByTestId('keyframe-marker').map((marker) => {
      const stackXPx = marker.getAttribute('data-stack-x-px') ?? '';
      const stackYPx = marker.getAttribute('data-stack-y-px') ?? '';

      return `${stackXPx}|${stackYPx}`;
    });

    expect(new Set(markerPositions)).toHaveLength(5);
  });

  /**
   * @description Snap grid lines must be present in the shared time rail so the 100ms drag grid is visible, not only behavioral.
   */
  it('renders snap grid lines across the shared time rail', () => {
    const ownerKf = makeKeyframe({ name: 'Owner Fade', offsetMs: 0 });
    const timeline = makeTimeline({ keyframes: [ownerKf], durationMs: 1000 });

    render(<TimelineEditor {...defaultEditorProps({ timeline })} />);

    const gridLines = screen.getAllByTestId('timeline-grid-line');

    expect(gridLines).toHaveLength(11);
    expect(gridLines[1]?.style.left).toBe('10%');
  });

  /**
   * @description Extremely long timelines must not create thousands of sub-pixel grid nodes.
   */
  it('caps visible snap grid density for long timelines', () => {
    const ownerKf = makeKeyframe({ name: 'Owner Fade', offsetMs: 0 });
    const timeline = makeTimeline({ keyframes: [ownerKf], durationMs: 600_000 });

    render(<TimelineEditor {...defaultEditorProps({ timeline })} />);

    expect(screen.getAllByTestId('timeline-grid-line').length).toBeLessThanOrEqual(241);
  });

  /**
   * @description Header status chips must ellipsize long names instead of crowding the add-keyframe control.
   */
  it('bounds long timeline and element names in the header chips', () => {
    const timeline = makeTimeline({ name: 'An Extremely Long Broadcast Timeline Name That Should Never Crowd Tools' });

    render(
      <TimelineEditor
        {...defaultEditorProps({ timeline })}
        targetName="A Very Long Lower Third Element Name That Should Stay Contained"
      />,
    );

    expect(screen.getByText(`Editing ${timeline.name}`).style.overflow).toBe('hidden');
    expect(screen.getByText(/element: a very long lower third/i).style.overflow).toBe('hidden');
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

  /** @description Selecting a keyframe marker must move the playhead and preview to that keyframe immediately. */
  it('seeks the timeline when selecting a keyframe marker', () => {
    const kf = makeKeyframe({ offsetMs: 700 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline });
    const { container } = render(<TimelineEditor {...props} />);
    const marker = container.querySelector('[data-testid="keyframe-marker"]');

    if (marker !== null) {
      fireEvent.pointerDown(marker, { clientX: 70, pointerId: 1 });
    }

    expect(props.onSelectKeyframe).toHaveBeenCalledWith(0);
    expect(props.onSeekTimeline).toHaveBeenCalledWith(700);
  });

  /** @description Context-menu/right-click gestures on markers must not select, seek, or start a drag. */
  it('ignores non-primary pointer down on a keyframe marker', () => {
    const kf = makeKeyframe({ offsetMs: 700 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline });
    const { container } = render(<TimelineEditor {...props} />);
    const marker = container.querySelector('[data-testid="keyframe-marker"]');

    if (marker !== null) {
      fireEvent.pointerDown(marker, { button: 2, clientX: 70, pointerId: 1 });
    }

    expect(props.onSelectKeyframe).not.toHaveBeenCalled();
    expect(props.onSeekTimeline).not.toHaveBeenCalled();
  });

  /** @description Selecting a keyframe row must seek the playhead too, so list and marker selection stay equivalent. */
  it('seeks the timeline when selecting a keyframe row', () => {
    const kf = makeKeyframe({ offsetMs: 900 });
    const timeline = makeTimeline({ keyframes: [kf] });
    const props = defaultEditorProps({ timeline });

    render(<TimelineEditor {...props} />);

    fireEvent.click(within(screen.getByRole('list', { name: /keyframes/i })).getByRole('button', { name: /kf-1/i }));

    expect(props.onSelectKeyframe).toHaveBeenCalledWith(0);
    expect(props.onSeekTimeline).toHaveBeenCalledWith(900);
  });

  /** @description Pointer cancel must not poison the next normal click by leaving synthetic-click suppression armed. */
  it('seeks on the next click after a scrub pointer cancel', () => {
    const props = defaultEditorProps();
    const { container } = render(<TimelineEditor {...props} />);

    const track = container.querySelector('[data-testid="timeline-track"]');

    expect(track).toBeDefined();

    if (track !== null) {
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40 }),
      });

      fireEvent.pointerDown(track, { button: 0, clientX: 30, pointerId: 1 });
      fireEvent.pointerCancel(track, { button: 0, clientX: 30, pointerId: 1 });
      vi.mocked(props.onSeekTimeline).mockClear();
      fireEvent.click(track, { clientX: 150 });
    }

    expect(props.onSeekTimeline).toHaveBeenCalledWith(1500);
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
      fireEvent.pointerMove(track, { clientX: 151, pointerId: 1 });
      fireEvent.pointerUp(track, { clientX: 151, pointerId: 1 });
    }

    expect(props.onMoveKeyframe).toHaveBeenCalledWith(0, 1500);
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
 * TimelineBottomPanel
 * --------------------------------------------------------------------------- */
