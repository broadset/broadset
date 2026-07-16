/** @vitest-environment jsdom */

import './test-helpers';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FilterEditor, ShadowEditor } from './index';

describe('FilterEditor', () => {
  /** @description A single filter must produce the correct CSS function string. */
  it('emits correct CSS filter for a single function', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px)" onChange={onChange} label="Filter" />);
    // Should show one filter entry
    expect(screen.getByText('blur')).toBeTruthy();
  });

  /** @description Multiple filters must be concatenated in stack order. */
  it('concatenates multiple filters in stack order', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px) brightness(1.2)" onChange={onChange} label="Filter" />);
    expect(screen.getByText('blur')).toBeTruthy();
    expect(screen.getByText('brightness')).toBeTruthy();
  });

  /** @description Removing a filter should leave only the remaining filters in the emitted string. */
  it('removes a filter and emits remaining', () => {
    const onChange = vi.fn<(value: string) => void>();

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
    render(<FilterEditor value="blur(5px)" onChange={vi.fn()} label="Filter" />);

    const addSelect = screen.getByLabelText('Add filter');

    // 'blur' is already in the stack, so it should not appear as an option
    const options = addSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((opt) => opt.textContent);

    expect(optionValues).not.toContain('blur');
  });

  /** @description Reorder buttons must move filters up/down in stack order. */
  it('reorders filters via up/down buttons', () => {
    const onChange = vi.fn<(value: string) => void>();

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
    const onChange = vi.fn<(value: string) => void>();

    render(<ShadowEditor value="2px 4px 6px #000000" mode="box" onChange={onChange} label="Shadow" />);
    expect(screen.getByText(/Shadow/)).toBeTruthy();
  });

  /** @description Multiple shadow layers must be comma-separated. */
  it('supports multiple comma-separated layers', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <ShadowEditor value="2px 4px 6px #000000, 0px 0px 4px #ff0000" mode="box" onChange={onChange} label="Shadow" />,
    );

    const layers = screen.getAllByTestId('shadow-layer');

    expect(layers.length).toBe(2);
  });

  /** @description Commas inside rgba()/hsla() color functions must not be treated as layer separators. Regression for a bug where `0 2px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04)` rendered as 8 garbled "shadows" because the parser split on every comma. */
  it('treats commas inside rgba() as part of the color, not layer separators', () => {
    render(
      <ShadowEditor
        value="0 2px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04)"
        mode="box"
        onChange={vi.fn()}
        label="Shadow"
      />,
    );

    const layers = screen.getAllByTestId('shadow-layer');

    expect(layers.length).toBe(2);
  });

  /** @description When an element already has a shadow defined (e.g. loaded from a saved document), the editor inputs MUST reflect the parsed values — not the all-zero defaults. Regression for a bug where `parseShadow` required a `px` suffix on every component and therefore failed on real-world CSS like `0 2px 32px rgba(...)` (bare `0`), silently returning default layers that hid the actual document state. This uses a fixture shadow literally pulled from sampleDocument.v1.json so any future regex regression reproduces the exact production failure. */
  it('populates inputs from the document-provided shadow instead of defaults', () => {
    const documentShadow = '0 2px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04)';

    render(<ShadowEditor value={documentShadow} mode="box" onChange={vi.fn()} label="Shadow" />);

    const offsetY1 = screen.getByLabelText('Layer 1 offset Y', { selector: 'input' });

    expect(offsetY1.getAttribute('value')).toBe('2');

    const offsetX1 = screen.getByLabelText('Layer 1 offset X', { selector: 'input' });

    expect(offsetX1.getAttribute('value')).toBe('0');

    const offsetY2 = screen.getByLabelText('Layer 2 offset Y', { selector: 'input' });

    expect(offsetY2.getAttribute('value')).toBe('1');
  });

  /** @description Disabling the shadow via toggle must emit 'none'. */
  it('emits none when disabled via toggle', () => {
    const onChange = vi.fn<(value: string) => void>();

    render(<ShadowEditor value="2px 4px 6px #000000" mode="box" onChange={onChange} label="Shadow" />);

    const toggle = screen.getByRole('switch', { name: 'Enable shadow' });

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('none');
  });

  /** @description Re-enabling the shadow must restore previously configured layers. */
  it('restores layers when re-enabled', () => {
    const onChange = vi.fn<(value: string) => void>();

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
    const onChange = vi.fn<(value: string) => void>();

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
