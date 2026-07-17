import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimelineRuler } from './timeline-ruler';

function renderRuler(onSeekTick = vi.fn()): { readonly onSeekTick: ReturnType<typeof vi.fn> } {
  render(
    <TimelineRuler currentTick={250} durationTicks={1000} ticksPerSecond={1000} onSeekTick={onSeekTick} />,
  );

  return { onSeekTick };
}

function railAt(ratio: number): { clientX: number } {
  const rail = screen.getByTestId('timeline-ruler-rail');

  vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 24, width: 400, height: 24, toJSON: () => ({}),
  });

  return { clientX: ratio * 400 };
}

describe('TimelineRuler', () => {
  it('renders second labels and positions the playhead from the exact tick', () => {
    renderRuler();
    expect(screen.getByText('0.0s')).toBeDefined();
    expect(screen.getByText('1.0s')).toBeDefined();
    expect(screen.getByTestId('timeline-playhead').style.left).toBe('25%');
  });

  it('seeks the exact tick on rail pointer-down and continues while dragging', () => {
    const { onSeekTick } = renderRuler();
    const rail = screen.getByTestId('timeline-ruler-rail');
    const down = railAt(0.5);

    fireEvent.pointerDown(rail, { button: 0, pointerId: 1, ...down });
    expect(onSeekTick).toHaveBeenLastCalledWith(500);

    fireEvent.pointerMove(rail, { buttons: 1, pointerId: 1, clientX: 0.733 * 400 });
    expect(onSeekTick).toHaveBeenLastCalledWith(733);
  });

  it('ignores non-primary pointer down', () => {
    const { onSeekTick } = renderRuler();
    const rail = screen.getByTestId('timeline-ruler-rail');

    fireEvent.pointerDown(rail, { button: 2, pointerId: 1, ...railAt(0.5) });
    expect(onSeekTick).not.toHaveBeenCalled();
  });
});
