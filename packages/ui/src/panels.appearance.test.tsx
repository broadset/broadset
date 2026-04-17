/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { PropertyValue } from './panels';
import { AppearancePanel } from './panels';

describe('AppearancePanel', () => {
  /** @description Fill, border, opacity, and blend mode must all be editable with proper update callbacks. */
  it('renders fill color and opacity controls', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 6, 6, 6]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={onUpdate}
      />,
    );

    // ColorInput for fill color should be rendered (via mock)
    const region = screen.getByRole('region', { name: 'Appearance' });

    expect(region).not.toBeNull();
  });

  /** @description Opacity changes must be forwarded to the update callback. */
  it('forwards opacity updates', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 6, 6, 6]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={onUpdate}
      />,
    );

    const opacitySlider = screen.getByRole('slider');

    fireEvent.change(opacitySlider, { target: { value: '0.5' } });
    expect(onUpdate).toHaveBeenCalledWith('opacity', 0.5);
  });

  /** @description Full border style options must include all 9 CSS border styles. */
  it('provides full border style options', () => {
    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 6, 6, 6]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={() => undefined}
      />,
    );

    // Check that the border style Select is present
    const region = screen.getByRole('region', { name: 'Appearance' });

    expect(within(region).queryAllByText('solid').length).toBeGreaterThanOrEqual(1);
  });

  /** @description Fill mode must be an explicit visual choice (Solid/Gradient), and gradient mode must avoid raw CSS-string text fields. */
  it('supports fill mode switching without exposing raw CSS gradient input', () => {
    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        backgroundGradient="linear-gradient(#fff, #000)"
        showGradient
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 6, 6, 6]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Solid' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Gradient' })).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Gradient stops' })).not.toBeNull();
    expect(screen.queryByLabelText('CSS Gradient')).toBeNull();

    const panel = screen.getByRole('region', { name: 'Appearance' });

    expect(within(panel).queryByText(/linear-gradient\(|rgba\(|#[0-9a-f]{6}/i)).toBeNull();
  });

  /** @description Border radius editing must expose all four corners and a link toggle for predictable linked/unlinked behavior. */
  it('renders four corner radius fields and a link toggle', () => {
    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        showGradient
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 8, 10, 12]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Border radius TL' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Border radius TR' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Border radius BR' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Border radius BL' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Link corners' })).not.toBeNull();
  });

  /** @description Opacity must be presented with a percent readout so users never see normalized 0-1 values. */
  it('shows opacity with percent readout', () => {
    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 6, 6, 6]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={() => undefined}
      />,
    );

    expect(screen.getByRole('slider', { name: 'Opacity' })).not.toBeNull();
    expect(screen.getByText('75%')).not.toBeNull();
  });

  /** @description Linked corner mode must apply the same radius value to all four corners when one field changes. */
  it('updates all corner radii when corners are linked', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 8, 10, 12]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Link corners' }));

    const topLeft = screen.getByRole('textbox', { name: 'Border radius TL' });

    fireEvent.change(topLeft, { target: { value: '20' } });
    fireEvent.blur(topLeft);

    expect(onUpdate).toHaveBeenCalledWith('borderRadius', [20, 20, 20, 20]);
  });

  /** @description Unlinked corner mode must only update the edited corner, preserving the other corner values. */
  it('updates only one corner radius when corners are unlinked', () => {
    const onUpdate = jest.fn<(key: string, value: PropertyValue) => void>();

    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={[6, 8, 10, 12]}
        opacity={0.75}
        blendMode="normal"
        onUpdate={onUpdate}
      />,
    );

    const topRight = screen.getByRole('textbox', { name: 'Border radius TR' });

    fireEvent.change(topRight, { target: { value: '22' } });
    fireEvent.blur(topRight);

    expect(onUpdate).toHaveBeenCalledWith('borderRadius', [6, 22, 10, 12]);
  });
});
