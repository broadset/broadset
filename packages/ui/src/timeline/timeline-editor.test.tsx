import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimelineBottomPanel } from './timeline-bottom-panel';
import { TimelineEditor } from './timeline-editor';
import type { TimelineViewSequence } from './timeline-types';

const SEQUENCE: TimelineViewSequence = {
  id: 'seq-1',
  name: 'Intro',
  durationTicks: 1000,
  ticksPerSecond: 1000,
  tracks: [
    {
      id: 'track-1',
      label: 'Score Bug · opacity',
      sortKey: 'el-1 /appearance/opacity',
      targetsSelection: true,
      keyframes: [{ id: 'kf-a', tick: 0, category: 'accent', valueLabel: '0', interpolationLabel: null }],
    },
  ],
};

function editorProps(overrides: Partial<Parameters<typeof TimelineEditor>[0]> = {}) {
  return {
    sequence: SEQUENCE,
    currentTick: 250,
    snapIntervalTicks: 100,
    selectedKeyframe: null,
    previewState: 'paused' as const,
    easing: null,
    onSeekTick: vi.fn(),
    onSelectKeyframe: vi.fn(),
    onAddKeyframe: vi.fn(),
    onMoveKeyframe: vi.fn(),
    onDeleteKeyframe: vi.fn(),
    onCommitEasing: vi.fn(),
    onSelectEasingPreset: vi.fn(),
    onCloseEasing: vi.fn(),
    ...overrides,
  };
}

describe('TimelineEditor', () => {
  it('shows the exact tick readout with derived seconds and the preview state, with no transport buttons', () => {
    render(<TimelineEditor {...editorProps()} />);

    expect(screen.getByTestId('timeline-tick-readout').textContent).toContain('250');
    expect(screen.getByTestId('timeline-tick-readout').textContent).toContain('0.3s');
    expect(screen.getByText('Paused')).toBeDefined();
    expect(screen.queryByRole('button', { name: /play|pause|stop/i })).toBeNull();
  });

  it('adds a keyframe at the playhead on the resolved single track', () => {
    const props = editorProps();

    render(<TimelineEditor {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add keyframe' }));
    expect(props.onAddKeyframe).toHaveBeenCalledWith('seq-1', 'track-1', 250);
  });

  it('disables add with a hint when no track is resolvable', () => {
    const [firstTrack] = SEQUENCE.tracks;

    if (firstTrack === undefined) throw new Error('Expected SEQUENCE fixture to seed a track');

    const twoTracks = {
      ...SEQUENCE,
      tracks: [firstTrack, { ...firstTrack, id: 'track-2', sortKey: 'z /x' }],
    };

    render(<TimelineEditor {...editorProps({ sequence: twoTracks })} />);
    expect(screen.getByRole('button', { name: 'Add keyframe' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Select a property track')).toBeDefined();
  });

  it('renders the easing graph below the ruler when a segment is selected', () => {
    render(
      <TimelineEditor
        {...editorProps({
          selectedKeyframe: { trackId: 'track-1', keyframeId: 'kf-a' },
          easing: {
            interpolation: { kind: 'cubic-bezier', controlPoints: [0.42, 0, 0.58, 1] },
            presets: ['linear'],
            previewProgress: null,
          },
          onCommitEasing: vi.fn(),
          onSelectEasingPreset: vi.fn(),
          onCloseEasing: vi.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('easing-graph-editor')).toBeDefined();
  });

  it('renders no easing graph when easing is null', () => {
    render(<TimelineEditor {...editorProps({ easing: null })} />);
    expect(screen.queryByTestId('easing-graph-editor')).toBeNull();
  });
});

describe('TimelineBottomPanel', () => {
  it('is aria-hidden and pointer-inert when closed, visible with a close button when open', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <TimelineBottomPanel isOpen={false} subtitle="Document" title="Intro" onClose={onClose}>
        <div>content</div>
      </TimelineBottomPanel>,
    );
    const closedPanel = screen.getByTestId('timeline-bottom-panel');

    expect(closedPanel.getAttribute('aria-hidden')).toBe('true');
    expect(closedPanel.style.pointerEvents).toBe('none');

    rerender(
      <TimelineBottomPanel isOpen subtitle="Document" title="Intro" onClose={onClose}>
        <div>content</div>
      </TimelineBottomPanel>,
    );
    expect(screen.getByTestId('timeline-bottom-panel').getAttribute('aria-hidden')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close timeline' }));
    expect(onClose).toHaveBeenCalled();
  });
});
