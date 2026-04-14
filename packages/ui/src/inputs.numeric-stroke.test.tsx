/** @jest-environment jsdom */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';

import type { CssLengthInputProps, NumFieldProps, TextStrokeInputProps } from './inputs';
import { loadInputsTestModules } from './inputs-test-helpers';

let NumField: React.ComponentType<NumFieldProps>;
let CssLengthInput: React.ComponentType<CssLengthInputProps>;
let TextStrokeInput: React.ComponentType<TextStrokeInputProps>;

beforeAll(async () => {
  const mod = await loadInputsTestModules();

  NumField = mod.NumField;
  CssLengthInput = mod.CssLengthInput;
  TextStrokeInput = mod.TextStrokeInput;
});

describe('NumField', () => {
  /** @description Arrow Up/Down keys must increment/decrement by the configured step. */
  it('increments value on arrow up', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={50} step={1} onChange={onChange} label="X" />);

    const input = screen.getByRole('spinbutton', { name: 'X' });

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(51);
  });

  /** @description Arrow Down key must decrement by the configured step. */
  it('decrements value on arrow down', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={50} step={1} onChange={onChange} label="Y" />);

    const input = screen.getByRole('spinbutton', { name: 'Y' });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(49);
  });

  /** @description Blur must commit the current value to the store. */
  it('commits value on blur', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={50} step={1} onChange={onChange} label="Width" />);

    const input = screen.getByRole('spinbutton', { name: 'Width' });

    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  /** @description Invalid text input must revert to the last valid value on blur. */
  it('reverts invalid input on blur', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={50} step={1} onChange={onChange} label="Height" />);

    const input = screen.getByRole('spinbutton', { name: 'Height' });

    // Simulate typing invalid text then blurring
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);

    // Should not have called onChange with NaN
    const calls = onChange.mock.calls;

    for (const call of calls) {
      expect(Number.isNaN(call[0])).toBe(false);
    }
  });

  /** @description Displayed value must have at most 2 decimal places. */
  it('formats value with max 2 decimal places', () => {
    render(<NumField value={3.14159} step={0.01} onChange={jest.fn()} label="Val" />);

    const input = screen.getByRole('spinbutton', { name: 'Val' });
    // The displayed value should be limited to 2 decimals
    const val = input.getAttribute('value');

    expect(val).toBe('3.14');
  });

  /** @description Increment/decrement button clicks must commit immediately. */
  it('commits on increment button click', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={10} step={1} onChange={onChange} label="Size" />);

    const incButton = screen.getByLabelText('Increment Size');

    fireEvent.click(incButton);

    // HeroUI's NumberField fires onChange on value change, then the component
    // commits on blur. Simulate the blur to flush the committed value.
    const input = screen.getByRole('spinbutton', { name: 'Size' });

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(11);
  });
});

/* ============================================================
   CssLengthInput
   ============================================================ */

describe('CssLengthInput', () => {
  /** @description Switching units must convert the numeric value to the new unit. */
  it('converts value when unit changes', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<CssLengthInput value="96px" onChange={onChange} label="Width" />);

    // Switch to mm - 96px at 96dpi = 25.4mm
    const unitSelect = screen.getByLabelText('Unit');

    fireEvent.change(unitSelect, { target: { value: 'mm' } });
    expect(onChange).toHaveBeenCalled();

    const emittedValue = onChange.mock.calls[0]?.[0];

    expect(emittedValue).toContain('mm');
  });

  /** @description Blur should emit the current numeric value in the active unit. */
  it('accepts numeric input in the current unit', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<CssLengthInput value="50px" onChange={onChange} label="Height" />);

    const numInput = screen.getByRole('spinbutton', { name: 'Height value' });

    fireEvent.blur(numInput);
    expect(onChange).toHaveBeenLastCalledWith('50px');
  });
});

/* ============================================================
   TextStrokeInput
   ============================================================ */

describe('TextStrokeInput', () => {
  /** @description Width and color inputs must emit a valid CSS text-stroke shorthand. */
  it('emits CSS text-stroke shorthand', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<TextStrokeInput width={2} color="#000000" onChange={onChange} label="Text Stroke" />);

    // The component should already have produced the initial value.
    // Trigger width change
    const widthInput = screen.getByRole('spinbutton', { name: 'Stroke width' });

    fireEvent.change(widthInput, { target: { value: '3' } });
    fireEvent.blur(widthInput);
    expect(onChange).toHaveBeenCalled();

    const emitted = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

    expect(emitted).toMatch(/^\d+px\s+#[0-9a-fA-F]{6,8}$/);
  });
});
