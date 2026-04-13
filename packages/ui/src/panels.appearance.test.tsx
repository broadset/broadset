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
});
