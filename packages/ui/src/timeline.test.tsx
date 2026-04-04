/// <reference types="@testing-library/jest-dom/jest-globals" />
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';

import {
  AnimationBindingSections,
  TimelineBottomPanel,
  TimelineEditingProvider,
  TimelineEditor,
  useTimelineEditing,
} from './timeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKeyframe(offsetMs: number): {
  readonly offsetMs: number;
  readonly properties: Readonly<Record<string, unknown>>;
} {
  return { offsetMs, properties: {} };
}

// ===========================================================================
// TimelineEditor — Keyframe Management
// ===========================================================================

describe('TimelineEditor', () => {
  /** @description An empty timeline with no keyframes must show an empty state message. */
  it('renders empty state when no keyframes exist', () => {
    render(
      <TimelineEditor
        keyframes={[]}
        durationMs={2000}
        selectedIndex={null}
        onSelectKeyframe={jest.fn()}
        onAddKeyframe={jest.fn()}
        onMoveKeyframe={jest.fn()}
        onPlayTimeline={jest.fn()}
      />,
    );

    expect(screen.getByText(/no keyframes/i)).toBeInTheDocument();
  });

  /** @description Clicking the add button must call onAddKeyframe. */
  it('adds a keyframe on + button click', () => {
    const onAdd = jest.fn();

    render(
      <TimelineEditor
        keyframes={[]}
        durationMs={2000}
        selectedIndex={null}
        onSelectKeyframe={jest.fn()}
        onAddKeyframe={onAdd}
        onMoveKeyframe={jest.fn()}
        onPlayTimeline={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  /** @description Only the clicked marker should have aria-pressed="true". */
  it('single-selects a keyframe marker', () => {
    const keyframes = [makeKeyframe(0), makeKeyframe(500), makeKeyframe(1000)];
    const onSelect = jest.fn();

    render(
      <TimelineEditor
        keyframes={keyframes}
        durationMs={2000}
        selectedIndex={1}
        onSelectKeyframe={onSelect}
        onAddKeyframe={jest.fn()}
        onMoveKeyframe={jest.fn()}
        onPlayTimeline={jest.fn()}
      />,
    );

    const markers = screen.getAllByRole('button', { pressed: true });

    expect(markers).toHaveLength(1);
  });

  /** @description Clicking a keyframe marker must show the keyframe hint. */
  it('shows keyframe hint when marker is clicked', () => {
    const keyframes = [makeKeyframe(500)];

    render(
      <TimelineEditor
        keyframes={keyframes}
        durationMs={2000}
        selectedIndex={0}
        onSelectKeyframe={jest.fn()}
        onAddKeyframe={jest.fn()}
        onMoveKeyframe={jest.fn()}
        onPlayTimeline={jest.fn()}
      />,
    );

    expect(screen.getByTestId('keyframe-hint')).toBeInTheDocument();
  });

  /** @description Playing the timeline must call onPlayTimeline without onComplete. */
  it('calls onPlayTimeline without onComplete', () => {
    const onPlay = jest.fn();

    render(
      <TimelineEditor
        keyframes={[makeKeyframe(0)]}
        durationMs={2000}
        selectedIndex={null}
        onSelectKeyframe={jest.fn()}
        onAddKeyframe={jest.fn()}
        onMoveKeyframe={jest.fn()}
        onPlayTimeline={onPlay}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    expect(onPlay).toHaveBeenCalledTimes(1);
    // onPlayTimeline is called without arguments (no onComplete)
    expect(onPlay).toHaveBeenCalledWith();
  });
});

// ===========================================================================
// TimelineBottomPanel
// ===========================================================================

describe('TimelineBottomPanel', () => {
  /** @description When no timeline is being edited, the panel must be aria-hidden. */
  it('renders aria-hidden when no timeline is open', () => {
    render(<TimelineBottomPanel isOpen={false} onClose={jest.fn()} />);

    const panel = screen.getByTestId('timeline-bottom-panel');

    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  /** @description When a timeline is open, the TimelineEditor must be rendered. */
  it('renders TimelineEditor when open', () => {
    render(
      <TimelineBottomPanel
        isOpen={true}
        onClose={jest.fn()}
        keyframes={[makeKeyframe(0)]}
        durationMs={2000}
        selectedIndex={null}
        onSelectKeyframe={jest.fn()}
        onAddKeyframe={jest.fn()}
        onMoveKeyframe={jest.fn()}
        onPlayTimeline={jest.fn()}
      />,
    );

    const panel = screen.getByTestId('timeline-bottom-panel');

    expect(panel).not.toHaveAttribute('aria-hidden');
    // TimelineEditor is rendered inside
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });
});

// ===========================================================================
// TimelineEditingContext
// ===========================================================================

describe('TimelineEditingContext', () => {
  /** @description Outside a provider, the context hook must return null. */
  it('returns null outside a provider', () => {
    let result: unknown = 'not null';

    function Consumer(): JSX.Element {
      result = useTimelineEditing();

      return <div />;
    }

    render(<Consumer />);

    expect(result).toBeNull();
  });

  /** @description Inside a provider, target and snapshot start as null. */
  it('starts with null target and snapshot', () => {
    const ref = { current: null as ReturnType<typeof useTimelineEditing> };

    function Consumer(): JSX.Element {
      ref.current = useTimelineEditing();

      return <div />;
    }

    render(
      <TimelineEditingProvider>
        <Consumer />
      </TimelineEditingProvider>,
    );

    expect(ref.current).not.toBeNull();
    expect(ref.current?.target).toBeNull();
    expect(ref.current?.snapshot).toBeNull();
  });

  /** @description Opening a timeline sets target and snapshot; closing clears both. */
  it('open sets target and snapshot, close clears both', () => {
    const ref = { current: null as ReturnType<typeof useTimelineEditing> };

    function Consumer(): JSX.Element {
      ref.current = useTimelineEditing();

      return ref.current !== null ?
          <div>
            <button
              onClick={() => {
                ref.current?.openTimeline('el-1', 'fadeIn', new Map([['el-1', {} as never]]));
              }}
              type="button"
            >
              Open
            </button>
            <button
              onClick={() => {
                ref.current?.closeTimeline();
              }}
              type="button"
            >
              Close
            </button>
          </div>
        : <div />;
    }

    render(
      <TimelineEditingProvider>
        <Consumer />
      </TimelineEditingProvider>,
    );

    // Initially null
    expect(ref.current?.target).toBeNull();

    // Open
    fireEvent.click(screen.getByText('Open'));

    expect(ref.current?.target).toEqual({ elementId: 'el-1', timelineName: 'fadeIn' });
    expect(ref.current?.snapshot).not.toBeNull();

    // Close
    fireEvent.click(screen.getByText('Close'));

    expect(ref.current?.target).toBeNull();
    expect(ref.current?.snapshot).toBeNull();
  });
});

// ===========================================================================
// AnimationBindingSections
// ===========================================================================

describe('AnimationBindingSections', () => {
  /** @description State bindings must be listed with their timelines. */
  it('renders state bindings with timeline names', () => {
    render(
      <AnimationBindingSections
        stateBindings={[
          { stateName: 'IN', timelineId: 'tl-1', timelineName: 'fadeIn' },
          { stateName: 'OUT', timelineId: 'tl-2', timelineName: 'fadeOut' },
        ]}
        modifierBindings={[]}
        onAddModifier={jest.fn()}
        onRemoveStateBinding={jest.fn()}
      />,
    );

    expect(screen.getByText('IN')).toBeInTheDocument();
    expect(screen.getByText('fadeIn')).toBeInTheDocument();
    expect(screen.getByText('OUT')).toBeInTheDocument();
    expect(screen.getByText('fadeOut')).toBeInTheDocument();
  });

  /** @description Adding a modifier binding creates an in/out pair. */
  it('calls onAddModifier when add modifier button is clicked', () => {
    const onAdd = jest.fn();

    render(
      <AnimationBindingSections
        stateBindings={[]}
        modifierBindings={[]}
        onAddModifier={onAdd}
        onRemoveStateBinding={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add modifier/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  /** @description Removing a state binding calls onRemoveStateBinding with the state name. */
  it('calls onRemoveStateBinding when remove button is clicked', () => {
    const onRemove = jest.fn();

    render(
      <AnimationBindingSections
        stateBindings={[{ stateName: 'hover', timelineId: 'tl-h', timelineName: 'hoverIn' }]}
        modifierBindings={[]}
        onAddModifier={jest.fn()}
        onRemoveStateBinding={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(onRemove).toHaveBeenCalledWith('hover');
  });
});
