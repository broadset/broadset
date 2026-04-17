/** @jest-environment jsdom */

import './test-helpers';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { CssLengthInput } from './index';

describe('CssLengthInput behavior', () => {
  function selectUnit(unitControl: HTMLElement, unit: string): void {
    if (unitControl instanceof HTMLSelectElement) {
      fireEvent.change(unitControl, { target: { value: unit } });

      return;
    }

    fireEvent.click(unitControl);

    const unitList = screen.getByRole('listbox');

    fireEvent.click(within(unitList).getByRole('option', { name: unit }));
  }

  /** @description Changing unit must convert the current numeric value to preserve the same physical length. */
  it('converts value when unit changes', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<CssLengthInput label="Length" value="96px" onChange={onChange} />);

    const unit = screen.getByLabelText('Unit');

    selectUnit(unit, 'mm');

    const emitted = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] ?? '';

    expect(emitted.endsWith('mm')).toBe(true);
    expect(Number.parseFloat(emitted)).toBeCloseTo(25.4, 1);
  });

  /** @description Enter key must commit the current draft immediately for keyboard-driven editing workflows. */
  it('commits value on Enter', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<CssLengthInput label="Length" value="50px" onChange={onChange} />);

    const valueInput = screen.getByLabelText('Length value', { selector: 'input' });

    fireEvent.change(valueInput, { target: { value: '75' } });
    fireEvent.input(valueInput, { target: { value: '75' } });
    fireEvent.keyDown(valueInput, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('75px');
  });

  /** @description Empty or unitless values should show an em dash marker in the unit selector to avoid ambiguous state. */
  it('shows em dash unit marker for unitless value', () => {
    render(<CssLengthInput label="Length" value="12" onChange={jest.fn()} />);

    const unit = screen.getByLabelText('Unit');

    if (unit instanceof HTMLSelectElement) {
      expect(unit.value).toBe('—');

      return;
    }

    expect(unit.textContent).toContain('—');
  });
});
