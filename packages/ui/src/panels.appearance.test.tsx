/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyValue } from './panels';
import { AppearancePanel } from './panels';

const BASE_PROPS = {
  backgroundColor: '#ffffff',
  borderWidth: 1,
  borderColor: '#000000',
  borderStyle: 'solid',
  borderRadius: [6, 6, 6, 6] as const,
  opacity: 0.75,
} as const;

describe('AppearancePanel', () => {
  /** @description Opacity slider must emit the CSS-canonical 0-1 value to onUpdate so the model stores normalized opacity, not a 0-100 percent. */
  it('emits normalized 0-1 opacity when the percent slider moves', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<AppearancePanel {...BASE_PROPS} onUpdate={onUpdate} />);

    const slider = screen.getByRole('slider', { name: 'Opacity' });

    fireEvent.change(slider, { target: { value: '50' } });

    expect(onUpdate).toHaveBeenCalledWith('opacity', 0.5);
  });

  /** @description Opacity must render as a percent readout so users never see raw 0-1 values. */
  it('shows opacity as a percent readout', () => {
    render(<AppearancePanel {...BASE_PROPS} onUpdate={() => undefined} />);

    expect(screen.getByText('75%')).toBeTruthy();
  });

  /** @description All nine CSS border-style keywords must be selectable — the Select's listbox holds every value from the BORDER_STYLE_OPTIONS constant. */
  it('exposes the full set of CSS border styles as selectable options', () => {
    render(<AppearancePanel {...BASE_PROPS} onUpdate={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: /border style/i }));

    for (const style of ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']) {
      expect(screen.getByRole('option', { name: style })).toBeTruthy();
    }
  });

  /** @description Selecting a new border style must emit a borderStyle update with the exact chosen keyword. */
  it('emits the selected borderStyle keyword on option click', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<AppearancePanel {...BASE_PROPS} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /border style/i }));
    fireEvent.click(screen.getByRole('option', { name: 'dashed' }));

    expect(onUpdate).toHaveBeenCalledWith('borderStyle', 'dashed');
  });

  /** @description Switching from Gradient back to Solid must clear the gradient string so the renderer falls back to backgroundColor. Regression for a past bug where stale gradient wiped the background entirely. */
  it('clears the gradient value when switching back to Solid', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AppearancePanel
        {...BASE_PROPS}
        backgroundColor="#ff0000"
        backgroundGradient="linear-gradient(#fff, #000)"
        showGradient
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Solid' }));

    expect(onUpdate).toHaveBeenCalledWith('backgroundGradient', '');
  });

  /** @description Fill mode must be an explicit Solid/Gradient visual choice without exposing raw CSS gradient syntax anywhere on screen. */
  it('renders fill mode buttons and gradient stops group without raw CSS fields', () => {
    render(
      <AppearancePanel
        {...BASE_PROPS}
        backgroundGradient="linear-gradient(#fff, #000)"
        showGradient
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Solid' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gradient' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Gradient stops' })).toBeTruthy();
    expect(screen.queryByLabelText('CSS Gradient')).toBeNull();

    const panel = screen.getByRole('region', { name: 'Appearance' });

    expect(within(panel).queryByText(/linear-gradient\(|rgba\(|#[0-9a-f]{6}/i)).toBeNull();
  });

  /** @description Linked corner mode must broadcast the edited value to all four corners. */
  it('updates all four corner radii when corners are linked', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<AppearancePanel {...BASE_PROPS} borderRadius={[6, 8, 10, 12]} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Link corners' }));

    const topLeft = screen.getByRole('textbox', { name: 'Border radius TL' });

    fireEvent.change(topLeft, { target: { value: '20' } });
    fireEvent.blur(topLeft);

    expect(onUpdate).toHaveBeenCalledWith('borderRadius', [20, 20, 20, 20]);
  });

  /** @description Unlinked corner mode must only update the edited corner and preserve the other three values. */
  it('updates only the edited corner when corners are unlinked', () => {
    const onUpdate = vi.fn<(key: string, value: PropertyValue) => void>();

    render(<AppearancePanel {...BASE_PROPS} borderRadius={[6, 8, 10, 12]} onUpdate={onUpdate} />);

    const topRight = screen.getByRole('textbox', { name: 'Border radius TR' });

    fireEvent.change(topRight, { target: { value: '22' } });
    fireEvent.blur(topRight);

    expect(onUpdate).toHaveBeenCalledWith('borderRadius', [6, 22, 10, 12]);
  });
});
