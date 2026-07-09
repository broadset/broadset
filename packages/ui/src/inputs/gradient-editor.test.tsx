/** @vitest-environment jsdom */

import './test-helpers';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GradientEditor } from './index';

describe('GradientEditor', () => {
  /** @description The gradient editor must provide a visual stop-based editing workflow so users never type raw CSS gradient syntax. */
  it('renders draggable stop controls and an angle slider', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" onChange={onChange} />,
    );

    expect(screen.getByLabelText('Gradient stops')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Gradient angle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add stop' })).toBeTruthy();
  });

  /** @description Adding a stop must emit an updated gradient value immediately so canvas feedback remains instant. */
  it('adds a stop and emits a new gradient value', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    expect(onChange).toHaveBeenCalled();
  });

  /** @description The editor must enforce a minimum of 2 stops so users cannot create invalid gradients accidentally. */
  it('disables removing stops when only two remain', () => {
    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, #ff0000 0%, #0000ff 100%)" onChange={vi.fn()} />,
    );

    const removeButton = screen.getByRole('button', { name: 'Remove selected stop' });

    if (!(removeButton instanceof HTMLButtonElement)) {
      throw new TypeError('Expected remove control to render as a button element.');
    }

    expect(removeButton.disabled).toBe(true);
  });

  /** @description Stop handles must support drag updates so art direction work does not rely on numeric-only editing. */
  it('updates stop position when dragging a stop handle', () => {
    const onChange = vi.fn<(value: string) => void>();

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
    const onChange = vi.fn<(value: string) => void>();

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
    const onChange = vi.fn<(value: string) => void>();
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

  /** @description Editing a radial gradient must preserve its radial type instead of rewriting it as a linear gradient. */
  it('preserves radial gradients when editing stops', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <GradientEditor
        label="Gradient"
        value="radial-gradient(circle at 25% 75%, #ff0000 0%, #0000ff 100%)"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/^radial-gradient\(circle at 25% 75%, /);
  });

  /** @description Common CSS named-color gradients without explicit stop positions must edit as real stops, not reset to default red/blue values. */
  it('preserves named-color gradients without explicit positions when editing stops', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(<GradientEditor label="Gradient" value="linear-gradient(to right, green, yellow)" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    const emitted = onChange.mock.calls.at(-1)?.[0] ?? '';

    expect(emitted).toBe('linear-gradient(90deg, #008000 0%, #008000 50%, #ffff00 100%)');
  });

  /** @description Editing a non-canonical radial gradient must preserve its descriptor instead of rewriting the shape/size to the editor default. */
  it('preserves radial descriptors and inferred color stops when editing stops', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <GradientEditor
        label="Gradient"
        value="radial-gradient(ellipse farthest-corner at 25% 75%, red, blue)"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    const emitted = onChange.mock.calls.at(-1)?.[0] ?? '';

    expect(emitted).toBe(
      'radial-gradient(ellipse farthest-corner at 25% 75%, #ff0000 0%, #ff0000 50%, #0000ff 100%)',
    );
  });

  /** @description CSS color hints are valid gradient syntax and must survive stop edits instead of causing a fallback to default stops. */
  it('preserves linear color hints when editing stops', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <GradientEditor
        label="Gradient"
        value="linear-gradient(90deg, green 0%, 40%, yellow 100%)"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    const emitted = onChange.mock.calls.at(-1)?.[0] ?? '';

    expect(emitted).toBe('linear-gradient(90deg, #008000 0%, 40%, #008000 50%, #ffff00 100%)');
  });

  /** @description Conic angle stops must be parsed as authored stop positions, not inferred as evenly spaced default stops. */
  it('preserves conic angle stops when editing stops', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(<GradientEditor label="Gradient" value="conic-gradient(red 45deg, blue 180deg)" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    const emitted = onChange.mock.calls.at(-1)?.[0] ?? '';

    expect(emitted).toContain('#ff0000 45deg');
    expect(emitted).toContain('#0000ff 180deg');
    expect(emitted).not.toContain('#ff0000 0%, #ff0000 50%, #0000ff 100%');
  });

  /** @description Valid gradients with unsupported length stops must not be rewritten to the editor defaults on the next edit action. */
  it('does not emit fallback defaults for unsupported length-based gradient stops', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(<GradientEditor label="Gradient" value="linear-gradient(90deg, red 10px, blue 40px)" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  /** @description Multi-position CSS stops are valid but unsupported by the stop editor, so editing must not drop the extra position token. */
  it('does not emit fallback defaults for unsupported multi-position gradient stops', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, red 0% 10%, blue 100%)" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  /** @description Repeating gradients are valid CSS but outside the stop editor model, so edit actions must not rewrite them to defaults. */
  it('does not emit fallback defaults for repeating gradients', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(<GradientEditor label="Gradient" value="repeating-linear-gradient(red 0%, blue 20%)" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  /** @description Unsupported but valid imported gradients must present a locked editor state instead of exposing controls that look active but cannot safely edit the value. */
  it('disables stop color and angle controls for unsupported gradients', () => {
    render(
      <GradientEditor label="Gradient" value="linear-gradient(90deg, red 0% 10%, blue 100%)" onChange={vi.fn()} />,
    );

    const colorText = screen.getByLabelText('Stop color color text');
    const angleDial = screen.getByRole('slider', { name: 'Gradient angle' });

    expect(colorText).toHaveProperty('disabled', true);
    expect(angleDial).toHaveAttribute('aria-disabled', 'true');
  });

  /** @description Editing a conic gradient must preserve its conic type and start angle instead of rewriting it as a linear gradient. */
  it('preserves conic gradients when editing stops', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <GradientEditor
        label="Gradient"
        value="conic-gradient(from 45deg at 25% 75%, #ff0000 0%, #0000ff 100%)"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/^conic-gradient\(from 45deg at 25% 75%, /);
  });
});
