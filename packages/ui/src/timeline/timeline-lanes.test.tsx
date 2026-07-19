import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimelineLanes } from './timeline-lanes';
import type { TimelineViewTrack } from './timeline-types';

const TRACK: TimelineViewTrack = {
  id: 'track-1',
  label: 'Score Bug · opacity',
  sortKey: 'el-1 /appearance/opacity',
  targetsSelection: true,
  keyframes: [
    { id: 'kf-a', tick: 0, category: 'accent', valueLabel: '0', interpolationLabel: 'linear' },
    { id: 'kf-b', tick: 500, category: 'accent', valueLabel: '1', interpolationLabel: null },
  ],
};

function setup(overrides: Partial<Parameters<typeof TimelineLanes>[0]> = {}) {
  const props = {
    tracks: [TRACK],
    durationTicks: 1000,
    ticksPerSecond: 1000,
    snapIntervalTicks: 100,
    selectedKeyframe: null,
    onSelectKeyframe: vi.fn(),
    onSeekTick: vi.fn(),
    onMoveKeyframe: vi.fn(),
    onDeleteKeyframe: vi.fn(),
    ...overrides,
  };

  render(<TimelineLanes {...props} />);

  return props;
}

function mockLaneRect(): void {
  const lane = screen.getByTestId('timeline-lane-rail-track-1');

  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 28,
    width: 400,
    height: 28,
    toJSON: () => ({}),
  });
}

describe('TimelineLanes', () => {
  it('marks only the selected keyframe aria-pressed and colors markers by category', () => {
    setup({ selectedKeyframe: { trackId: 'track-1', keyframeId: 'kf-a' } });

    expect(screen.getByTestId('timeline-marker-kf-a').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('timeline-marker-kf-b').getAttribute('aria-pressed')).toBe('false');
  });

  it('selects on marker click without lane-label seeking', () => {
    const props = setup();

    fireEvent.click(screen.getByTestId('timeline-marker-kf-a'));
    expect(props.onSelectKeyframe).toHaveBeenCalledWith('track-1', 'kf-a');

    fireEvent.pointerDown(screen.getByText('Score Bug · opacity'), { button: 0, pointerId: 1 });
    expect(props.onSeekTick).not.toHaveBeenCalled();
  });

  it('seeks from empty lane-rail pointer-down', () => {
    const props = setup();

    mockLaneRect();
    fireEvent.pointerDown(screen.getByTestId('timeline-lane-rail-track-1'), {
      button: 0,
      pointerId: 1,
      clientX: 300,
    });
    expect(props.onSeekTick).toHaveBeenCalledWith(750);
  });

  it('previews an exact candidate tick during marker drag and commits the snapped integer tick', () => {
    const props = setup();

    mockLaneRect();

    const marker = screen.getByTestId('timeline-marker-kf-a');

    fireEvent.pointerDown(marker, { button: 0, pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(marker, { buttons: 1, pointerId: 1, clientX: 0.62 * 400 });
    expect(screen.getByTestId('timeline-drag-indicator').textContent).toContain('620');
    expect(screen.getByTestId('timeline-drag-indicator').textContent).toContain('0.6s');

    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 0.62 * 400 });
    expect(props.onMoveKeyframe).toHaveBeenCalledWith('track-1', 'kf-a', 600);
  });

  it('deletes the selected keyframe with Delete and Backspace', () => {
    const props = setup({ selectedKeyframe: { trackId: 'track-1', keyframeId: 'kf-a' } });

    fireEvent.keyDown(screen.getByTestId('timeline-marker-kf-a'), { key: 'Delete' });
    expect(props.onDeleteKeyframe).toHaveBeenCalledWith('track-1', 'kf-a');

    fireEvent.keyDown(screen.getByTestId('timeline-marker-kf-a'), { key: 'Backspace' });
    expect(props.onDeleteKeyframe).toHaveBeenCalledTimes(2);
  });

  it('ignores Delete on a marker that is not the selected keyframe', () => {
    const props = setup({ selectedKeyframe: { trackId: 'track-1', keyframeId: 'kf-b' } });

    fireEvent.keyDown(screen.getByTestId('timeline-marker-kf-a'), { key: 'Delete' });
    expect(props.onDeleteKeyframe).not.toHaveBeenCalled();
  });

  it('stops the Delete keydown from bubbling past the marker so ancestor shortcuts do not also fire', () => {
    const onDeleteKeyframe = vi.fn();
    const parentSpy = vi.fn();

    render(
      <div onKeyDown={parentSpy}>
        <TimelineLanes
          tracks={[TRACK]}
          durationTicks={1000}
          ticksPerSecond={1000}
          snapIntervalTicks={100}
          selectedKeyframe={{ trackId: 'track-1', keyframeId: 'kf-a' }}
          onSelectKeyframe={vi.fn()}
          onSeekTick={vi.fn()}
          onMoveKeyframe={vi.fn()}
          onDeleteKeyframe={onDeleteKeyframe}
        />
      </div>,
    );

    fireEvent.keyDown(screen.getByTestId('timeline-marker-kf-a'), { key: 'Delete' });

    expect(onDeleteKeyframe).toHaveBeenCalledWith('track-1', 'kf-a');
    expect(parentSpy).not.toHaveBeenCalled();
  });
});
