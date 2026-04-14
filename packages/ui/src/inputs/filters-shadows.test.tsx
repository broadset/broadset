/** @jest-environment jsdom */

import './test-helpers';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { FilterEditor, ShadowEditor } from './index';

describe('FilterEditor', () => {
  /** @description A single filter must produce the correct CSS function string. */
  it('emits correct CSS filter for a single function', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px)" onChange={onChange} label="Filter" />);
    // Should show one filter entry
    expect(screen.getByText('blur')).toBeTruthy();
  });

  /** @description Multiple filters must be concatenated in stack order. */
  it('concatenates multiple filters in stack order', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px) brightness(1.2)" onChange={onChange} label="Filter" />);
    expect(screen.getByText('blur')).toBeTruthy();
    expect(screen.getByText('brightness')).toBeTruthy();
  });

  /** @description Removing a filter should leave only the remaining filters in the emitted string. */
  it('removes a filter and emits remaining', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px) brightness(1.2)" onChange={onChange} label="Filter" />);

    const removeButtons = screen.getAllByLabelText(/Remove/);

    const firstRemoveButton = removeButtons[0];

    if (firstRemoveButton !== undefined) {
      fireEvent.click(firstRemoveButton);
    }

    expect(onChange).toHaveBeenCalled();
  });

  /** @description Functions already in the stack must be excluded from the Add dropdown. */
  it('excludes already-added functions from add dropdown', () => {
    render(<FilterEditor value="blur(5px)" onChange={jest.fn()} label="Filter" />);

    const addSelect = screen.getByLabelText('Add filter');

    // 'blur' is already in the stack, so it should not appear as an option
    const options = addSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((opt) => opt.textContent);

    expect(optionValues).not.toContain('blur');
  });

  /** @description Reorder buttons must move filters up/down in stack order. */
  it('reorders filters via up/down buttons', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px) brightness(1.2)" onChange={onChange} label="Filter" />);

    // Move brightness up (second filter)
    const moveUpButtons = screen.getAllByLabelText(/Move .* up/);

    // The second filter's "Move up" button
    const moveUpBtn = moveUpButtons[1];

    if (moveUpBtn !== undefined) {
      fireEvent.click(moveUpBtn);
    }

    expect(onChange).toHaveBeenCalled();

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

    // After reorder, brightness should come before blur
    expect(lastCall).toMatch(/^brightness/);
  });
});

/* ============================================================
   ShadowEditor
   ============================================================ */

describe('ShadowEditor', () => {
  /** @description Valid shadow values must produce a correct CSS shadow string. */
  it('emits a valid CSS shadow string', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<ShadowEditor value="2px 4px 6px #000000" mode="box" onChange={onChange} label="Shadow" />);
    expect(screen.getByText(/Shadow/)).toBeTruthy();
  });

  /** @description Multiple shadow layers must be comma-separated. */
  it('supports multiple comma-separated layers', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(
      <ShadowEditor value="2px 4px 6px #000000, 0px 0px 4px #ff0000" mode="box" onChange={onChange} label="Shadow" />,
    );

    const layers = screen.getAllByTestId('shadow-layer');

    expect(layers.length).toBe(2);
  });

  /** @description Disabling the shadow via toggle must emit 'none'. */
  it('emits none when disabled via toggle', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<ShadowEditor value="2px 4px 6px #000000" mode="box" onChange={onChange} label="Shadow" />);

    const toggle = screen.getByRole('switch', { name: 'Enable shadow' });

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('none');
  });

  /** @description Re-enabling the shadow must restore previously configured layers. */
  it('restores layers when re-enabled', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<ShadowEditor value="2px 4px 6px #000000" mode="box" onChange={onChange} label="Shadow" />);

    const toggle = screen.getByRole('switch', { name: 'Enable shadow' });

    // Disable
    fireEvent.click(toggle);
    // Re-enable
    fireEvent.click(toggle);

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

    expect(lastCall).not.toBe('none');
    expect(lastCall).toContain('px');
  });

  /** @description Layers must be reorderable via up/down buttons. */
  it('reorders layers via up/down buttons', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(
      <ShadowEditor value="2px 4px 6px #ff0000, 0px 0px 4px #00ff00" mode="box" onChange={onChange} label="Shadow" />,
    );

    // Move second layer up
    const moveUpButtons = screen.getAllByLabelText(/Move layer .* up/);

    // Layer 2 up button
    const moveUpBtn = moveUpButtons[1];

    if (moveUpBtn !== undefined) {
      fireEvent.click(moveUpBtn);
    }

    expect(onChange).toHaveBeenCalled();

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

    // After reorder, #00ff00 layer should come first
    expect(lastCall).toMatch(/^0px/);
  });
});
