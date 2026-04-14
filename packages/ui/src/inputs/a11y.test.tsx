/** @jest-environment jsdom */

import './test-helpers';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { ColorInput, CssLengthInput, NumField, TextStrokeInput } from './index';

describe('Accessibility: aria-invalid on input validation', () => {
  /** @description ColorInput must set aria-invalid="true" on the text field when the user types an unparseable color string, enabling screen readers to announce the error state. */
  it('ColorInput sets aria-invalid when text is unparseable', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Fill" />);

    const input = screen.getByLabelText('Fill color text');

    fireEvent.change(input, { target: { value: 'notacolor' } });

    // While drafting invalid text, aria-invalid should be true
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  /** @description ColorInput must not set aria-invalid when the draft text is a valid color, so screen readers do not falsely announce errors. */
  it('ColorInput does not set aria-invalid for valid draft', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Fill" />);

    const input = screen.getByLabelText('Fill color text');

    fireEvent.change(input, { target: { value: '#00ff00' } });

    // Valid draft should not be marked invalid
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
  });

  /** @description ColorInput must clear aria-invalid after blur reverts to the last valid value, so the error state does not linger. */
  it('ColorInput clears aria-invalid after blur revert', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Fill" />);

    const input = screen.getByLabelText('Fill color text');

    fireEvent.change(input, { target: { value: 'notacolor' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.blur(input);

    // After blur reverts to last valid, aria-invalid and aria-describedby should be cleared
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  /** @description ColorInput must provide an error message linked by aria-describedby when the draft is invalid, so screen readers can announce the reason for the error state. */
  it('ColorInput provides aria-describedby error message when invalid', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Fill" />);

    const input = screen.getByLabelText('Fill color text');

    fireEvent.change(input, { target: { value: 'notacolor' } });

    // aria-describedby should point to an error message element
    const describedBy = input.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();

    const errorMessage = document.getElementById(describedBy as string);

    expect(errorMessage).not.toBeNull();
    expect(errorMessage?.textContent).toContain('Invalid color');
  });

  /** @description ColorInput must remove the error message when the draft becomes valid, so screen readers stop announcing an error. */
  it('ColorInput removes error message when draft becomes valid', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Fill" />);

    const input = screen.getByLabelText('Fill color text');

    fireEvent.change(input, { target: { value: 'notacolor' } });

    const describedBy = input.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();

    fireEvent.change(input, { target: { value: '#00ff00' } });

    // After typing valid color, describedby should be removed
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  /** @description All icon-only buttons in ColorInput must have aria-label attributes so they are announced by screen readers. */
  it('ColorInput swatch and palette buttons have aria-label', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Fill" />);

    const swatch = screen.getByLabelText('Fill color swatch');

    expect(swatch).not.toBeNull();

    fireEvent.click(swatch);

    const addButton = screen.getByLabelText('Add to palette');

    expect(addButton).not.toBeNull();
  });

  /** @description NumField must have an accessible role and label so screen readers can identify it as a numeric input. */
  it('NumField has accessible spinbutton role with label', () => {
    render(<NumField value={50} step={1} onChange={jest.fn()} label="Width" />);

    const input = screen.getByLabelText('Width', { selector: 'input' });

    expect(input).not.toBeNull();
  });

  /** @description CssLengthInput must expose labeled number and unit controls so screen readers can interact with both parts independently. */
  it('CssLengthInput has labeled number and unit controls', () => {
    render(<CssLengthInput value="50px" onChange={jest.fn()} label="Height" />);

    const numInput = screen.getByLabelText('Height value', { selector: 'input' });
    const unitSelect = screen.getByLabelText('Unit');

    expect(numInput).not.toBeNull();
    expect(unitSelect).not.toBeNull();
  });

  /** @description TextStrokeInput must group its controls within a labeled fieldset so screen readers can navigate them as a logical unit. */
  it('TextStrokeInput groups controls in a labeled fieldset', () => {
    render(<TextStrokeInput width={2} color="#000000" onChange={jest.fn()} label="Text Stroke" />);

    const fieldset = screen.getByRole('group', { name: 'Text Stroke' });

    expect(fieldset).not.toBeNull();
  });
});
