/** @jest-environment jsdom */

import './test-helpers';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { CssLengthInput } from './index';

describe('CssLengthInput behavior', () => {
  /** @description Changing unit must convert the current numeric value to preserve the same physical length. */
  it('converts value when unit changes', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<CssLengthInput label="Length" value="96px" onChange={onChange} />);

    const unit = screen.getByLabelText('Unit');

    fireEvent.change(unit, { target: { value: 'mm' } });

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
    fireEvent.keyDown(valueInput, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('75px');
  });

  /** @description Empty or unitless values should show an em dash marker in the unit selector to avoid ambiguous state. */
  it('shows em dash unit marker for unitless value', () => {
    render(<CssLengthInput label="Length" value="12" onChange={jest.fn()} />);

    const unit = screen.getByLabelText('Unit');

    if (!(unit instanceof HTMLSelectElement)) {
      throw new TypeError('Expected the unit control to render as a select element.');
    }

    expect(unit.value).toBe('—');
  });
});
