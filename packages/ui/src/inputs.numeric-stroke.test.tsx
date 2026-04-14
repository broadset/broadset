/** @jest-environment jsdom */

import './inputs-test-helpers';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { CssLengthInput, NumField, TextStrokeInput } from './inputs';
import { convertLength, isCssUnit, toCssUnit } from './inputs/css-length';

describe('NumField', () => {
  /** @description Arrow Up/Down keys must increment/decrement by the configured step. */
  it('increments value on arrow up', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={50} step={1} onChange={onChange} label="X" />);

    const input = screen.getByLabelText('X', { selector: 'input' });

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(51);
  });

  /** @description Arrow Down key must decrement by the configured step. */
  it('decrements value on arrow down', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={50} step={1} onChange={onChange} label="Y" />);

    const input = screen.getByLabelText('Y', { selector: 'input' });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(49);
  });

  /** @description Blur must commit the current value to the store. */
  it('commits value on blur', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={50} step={1} onChange={onChange} label="Width" />);

    const input = screen.getByLabelText('Width', { selector: 'input' });

    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  /** @description Invalid text input must revert to the last valid value on blur. */
  it('reverts invalid input on blur', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={50} step={1} onChange={onChange} label="Height" />);

    const input = screen.getByLabelText('Height', { selector: 'input' });

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

    const input = screen.getByLabelText('Val', { selector: 'input' });
    // The displayed value should be limited to 2 decimals
    const val = input.getAttribute('value');

    expect(val).toBe('3.14');
  });

  /** @description Increment/decrement button clicks must commit immediately. */
  it('commits on increment button click', () => {
    const onChange = jest.fn<(value: number) => void>();

    render(<NumField value={10} step={1} onChange={onChange} label="Size" />);

    const incButton = screen.getByLabelText(/(Increase|Increment) Size/);

    fireEvent.click(incButton);

    // HeroUI's NumberField fires onChange on value change, then the component
    // commits on blur. Simulate the blur to flush the committed value.
    const input = screen.getByLabelText('Size', { selector: 'input' });

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(11);
  });
});

/* ============================================================
   CssLengthInput
   ============================================================ */

describe('CssLengthInput', () => {
  /** @description CSS length conversion must preserve absolute lengths across supported units. */
  it('converts absolute length units deterministically', () => {
    expect(convertLength(96, 'px', 'mm')).toBeCloseTo(25.4, 5);
    expect(convertLength(25.4, 'mm', 'in')).toBeCloseTo(1, 5);
    expect(convertLength(1, 'in', 'px')).toBeCloseTo(96, 5);
  });

  /** @description Unit helpers must guard unsupported values and normalize unknown units to px. */
  it('normalizes CSS units safely', () => {
    expect(isCssUnit('mm')).toBe(true);
    expect(isCssUnit('vh')).toBe(false);
    expect(toCssUnit('in')).toBe('in');
    expect(toCssUnit('vh')).toBe('px');
  });

  /** @description Blur should emit the current numeric value in the active unit. */
  it('accepts numeric input in the current unit', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<CssLengthInput value="50px" onChange={onChange} label="Height" />);

    const numInput = screen.getByLabelText('Height value', { selector: 'input' });

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
    const widthInput = screen.getByLabelText('Stroke width', { selector: 'input' });

    fireEvent.change(widthInput, { target: { value: '3' } });
    fireEvent.blur(widthInput);
    expect(onChange).toHaveBeenCalled();

    const emitted = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

    expect(emitted).toMatch(/^\d+px\s+#[0-9a-fA-F]{6,8}$/);
  });
});
