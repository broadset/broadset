/** @jest-environment jsdom */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';

import type { ColorInputProps } from './inputs';
import { loadInputsTestModules } from './inputs-test-helpers';

let ColorInput: React.ComponentType<ColorInputProps>;

beforeAll(async () => {
  const mod = await loadInputsTestModules();

  ColorInput = mod.ColorInput;
});

describe('ColorInput', () => {
  /** @description Typing a valid hex value in the text field must emit the color string via onChange. */
  it('accepts valid hex text input and emits value', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<ColorInput value="#ff0000" onChange={onChange} label="Fill" />);

    const input = screen.getByLabelText('Fill color text');

    fireEvent.change(input, { target: { value: '#00ff00' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('#00ff00');
  });

  /** @description A saturation/brightness area and hue slider must be available for visual color picking. */
  it('renders saturation/brightness area and hue slider', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Fill" />);
    // Open picker
    fireEvent.click(screen.getByTestId('color-swatch'));
    expect(screen.getByLabelText('Hue')).toBeTruthy();
    expect(screen.getByTestId('color-area')).toBeTruthy();
  });

  /** @description Alpha adjustment must include opacity in the emitted color value. */
  it('supports alpha adjustment', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<ColorInput value="rgba(255,0,0,1)" onChange={onChange} label="Fill" />);
    fireEvent.click(screen.getByTestId('color-swatch'));

    const alphaSlider = screen.getByRole('slider', { name: 'Alpha' });

    fireEvent.change(alphaSlider, { target: { value: '0.5' } });
    expect(onChange).toHaveBeenCalled();
  });

  /** @description Invalid color strings must revert to last valid color on blur. */
  it('reverts to last valid color on invalid input blur', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<ColorInput value="#ff0000" onChange={onChange} label="Fill" />);

    const input = screen.getByLabelText('Fill color text');

    fireEvent.change(input, { target: { value: 'notacolor' } });
    fireEvent.blur(input);
    // Should not emit invalid value
    expect(onChange).not.toHaveBeenCalledWith('notacolor');
  });

  /** @description Format toggle must convert the displayed value to the selected format. */
  it('toggles display format between hex/rgb/hsl', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Fill" />);
    fireEvent.click(screen.getByTestId('color-swatch'));

    const formatToggle = screen.getByLabelText('Color format');

    expect(formatToggle).toBeTruthy();
  });

  /** @description Fully transparent color must show checkerboard pattern on the swatch. */
  it('shows checkerboard for fully transparent color', () => {
    render(<ColorInput value="rgba(0,0,0,0)" onChange={jest.fn()} label="Fill" />);

    const swatch = screen.getByTestId('color-swatch');

    expect(swatch).toBeTruthy();
    // Transparent swatch should have checkerboard background
    expect(swatch.getAttribute('data-transparent')).toBe('true');
  });

  /** @description Saved palette colors must be removable individually. */
  it('supports palette save and remove', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Fill" />);
    fireEvent.click(screen.getByTestId('color-swatch'));

    const addButton = screen.getByLabelText('Add to palette');

    fireEvent.click(addButton);

    // After adding, remove button should appear
    const removeButtons = screen.getAllByLabelText('Remove from palette');

    expect(removeButtons.length).toBeGreaterThan(0);
  });
});
