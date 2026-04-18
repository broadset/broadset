/** @jest-environment jsdom */

import './test-helpers';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { GradientEditor } from './index';

describe('GradientEditor', () => {
  /** @description The gradient editor must provide a visual stop-based editing workflow so users never type raw CSS gradient syntax. */
  it('renders draggable stop controls and an angle slider', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" onChange={onChange} />,
    );

    expect(screen.getByLabelText('Gradient stops')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Gradient angle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add stop' })).toBeTruthy();
  });

  /** @description Adding a stop must emit an updated gradient value immediately so canvas feedback remains instant. */
  it('adds a stop and emits a new gradient value', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    expect(onChange).toHaveBeenCalled();
  });

  /** @description The editor must enforce a minimum of 2 stops so users cannot create invalid gradients accidentally. */
  it('disables removing stops when only two remain', () => {
    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" onChange={jest.fn()} />,
    );

    const removeButton = screen.getByRole('button', { name: 'Remove selected stop' });

    if (!(removeButton instanceof HTMLButtonElement)) {
      throw new TypeError('Expected remove control to render as a button element.');
    }

    expect(removeButton.disabled).toBe(true);
  });

  /** @description Stop handles must support drag updates so art direction work does not rely on numeric-only editing. */
  it('updates stop position when dragging a stop handle', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" onChange={onChange} />,
    );

    const bar = screen.getByRole('group', { name: 'Gradient stops' });
    const stopHandle = screen.getByRole('button', { name: 'Stop 1 handle' });

    Object.defineProperty(bar, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 44,
        height: 44,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      }),
    });

    fireEvent.pointerDown(stopHandle, { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 100 });
    fireEvent.mouseUp(window, { clientX: 100 });

    const emittedValues = onChange.mock.calls.map(([emitted]) => emitted);
    const hasDraggedPosition = emittedValues.some((value) => value.includes('#ff0000 50%'));

    expect(hasDraggedPosition).toBe(true);
  });

  /** @description Drag tracking must continue for the full drag, not stop after the first few pixels. Regression for a bug where setPointerCapture on the handle Button stopped the parent track from receiving pointermove events after the first pixel, leaving drags frozen near the start. */
  it('continues tracking drag motion across many pointer moves', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" onChange={onChange} />,
    );

    const bar = screen.getByRole('group', { name: 'Gradient stops' });
    const stopHandle = screen.getByRole('button', { name: 'Stop 1 handle' });

    Object.defineProperty(bar, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 44,
        height: 44,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      }),
    });

    fireEvent.pointerDown(stopHandle, { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 20 });
    fireEvent.mouseMove(window, { clientX: 60 });
    fireEvent.mouseMove(window, { clientX: 140 });
    fireEvent.mouseMove(window, { clientX: 180 });
    fireEvent.mouseUp(window, { clientX: 180 });

    const emittedPercents = onChange.mock.calls
      .map(([emitted]) => {
        const match = /#ff0000 (\d+)%/.exec(emitted);

        return match === null ? null : Number(match[1]);
      })
      .filter((percent): percent is number => percent !== null);

    expect(emittedPercents).toContain(10);
    expect(emittedPercents).toContain(30);
    expect(emittedPercents).toContain(70);
    expect(emittedPercents).toContain(90);
  });

  /** @description Controlled updates from the parent must reset local gradient editor state when a different gradient is loaded. */
  it('syncs displayed stops when the value prop changes', () => {
    const onChange = jest.fn<(value: string) => void>();
    const { rerender } = render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" onChange={onChange} />,
    );

    const initialStop = screen.getByRole('button', { name: 'Stop 1 handle' });

    expect(initialStop.textContent).toBe('0%');

    rerender(
      <GradientEditor label="Gradient" value="linear-gradient(45deg, #00ff00 20%, #0000ff 80%)" onChange={onChange} />,
    );

    const updatedStop = screen.getByRole('button', { name: 'Stop 1 handle' });

    expect(updatedStop.textContent).toBe('20%');
  });
});
