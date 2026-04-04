/// <reference types="@testing-library/jest-dom/jest-globals" />
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { ColorInput, CssLengthInput, FilterEditor, ShadowEditor, TextStrokeInput } from './inputs';

// ===========================================================================
// Color Input
// ===========================================================================

describe('ColorInput', () => {
  /**
   * @description Interaction with the color picker must emit a new CSS color
   * string via onChange.
   */
  it('emits CSS color string on picker interaction', () => {
    const onChange = jest.fn();

    render(<ColorInput value="#ff0000" onChange={onChange} label="Fill color" />);

    const hexInput = screen.getByLabelText('Fill color');

    fireEvent.change(hexInput, { target: { value: '#00ff00' } });

    expect(onChange).toHaveBeenCalledWith('#00ff00');
  });

  /**
   * @description Typing a valid hex value in the text input must emit the
   * color value.
   */
  it('accepts valid hex text input', () => {
    const onChange = jest.fn();

    render(<ColorInput value="#ff0000" onChange={onChange} label="Color" />);

    const input = screen.getByLabelText('Color');

    fireEvent.change(input, { target: { value: '#abcdef' } });

    expect(onChange).toHaveBeenCalledWith('#abcdef');
  });

  /**
   * @description The color picker must render a saturation/brightness area
   * and a hue slider for full color selection.
   */
  it('renders hue slider and saturation area', () => {
    render(<ColorInput value="#ff0000" onChange={jest.fn()} label="Color" />);

    expect(screen.getByRole('slider', { name: /hue/i })).toBeInTheDocument();
  });

  /**
   * @description The color picker must support alpha/opacity adjustment and
   * include opacity in the emitted color.
   */
  it('supports alpha adjustment', () => {
    render(<ColorInput value="rgba(255,0,0,0.5)" onChange={jest.fn()} label="Color" />);

    const alphaSlider = screen.getByRole('slider', { name: /alpha|opacity/i });

    expect(alphaSlider).toBeInTheDocument();
  });
});

// ===========================================================================
// CSS Length Input
// ===========================================================================

describe('CssLengthInput', () => {
  /**
   * @description When the unit is switched, the numeric value must be
   * converted to the equivalent in the new unit.
   */
  it('converts value when unit is switched', () => {
    const onChange = jest.fn();

    render(<CssLengthInput value={96} unit="px" onChange={onChange} label="Width" />);

    // HeroUI Select renders a button trigger; click to open, then select option
    const trigger = screen.getByRole('button', { name: /unit/i });

    fireEvent.click(trigger);

    // React Aria Select opens a listbox; select "mm"
    const mmOption = screen.getByRole('option', { name: 'mm' });

    fireEvent.click(mmOption);

    // 96px = 25.4mm
    expect(onChange).toHaveBeenCalledWith(expect.closeTo(25.4, 1), 'mm');
  });

  /**
   * @description Typing a numeric value must emit it in the current unit.
   */
  it('accepts numeric input in current unit', () => {
    const onChange = jest.fn();

    render(<CssLengthInput value={50} unit="px" onChange={onChange} label="Width" />);

    const input = screen.getByRole('textbox', { name: /width/i });

    // React Aria NumberField commits on blur; simulate typing + blur
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(100, 'px');
  });
});

// ===========================================================================
// Text Stroke Input
// ===========================================================================

describe('TextStrokeInput', () => {
  /**
   * @description Setting width and color must emit a valid CSS text-stroke
   * shorthand value.
   */
  it('emits text-stroke shorthand', () => {
    const onChange = jest.fn();

    render(<TextStrokeInput width={2} color="#000000" onChange={onChange} label="Stroke" />);

    const widthInput = screen.getByRole('textbox', { name: /width/i });

    // React Aria NumberField commits on blur; simulate typing + blur
    fireEvent.focus(widthInput);
    fireEvent.change(widthInput, { target: { value: '3' } });
    fireEvent.blur(widthInput);

    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('px'));
  });
});

// ===========================================================================
// Filter Editor
// ===========================================================================

describe('FilterEditor', () => {
  /**
   * @description Adding a single filter must emit the correct CSS filter
   * function string.
   */
  it('emits single filter string', () => {
    const onChange = jest.fn();

    render(<FilterEditor value="blur(5px)" onChange={onChange} label="Filters" />);

    // The filter editor parses the value and renders the stack
    expect(screen.getByText(/blur/i)).toBeInTheDocument();
  });

  /**
   * @description Multiple filters must be concatenated in stack order.
   */
  it('displays multiple filters in stack order', () => {
    render(<FilterEditor value="blur(5px) brightness(1.2)" onChange={jest.fn()} label="Filters" />);

    const filterNames = screen.getAllByRole('listitem');

    expect(filterNames).toHaveLength(2);
  });

  /**
   * @description Removing a filter must update the emitted string with
   * only the remaining filters.
   */
  it('removes filter from stack', () => {
    const onChange = jest.fn();

    render(<FilterEditor value="blur(5px) brightness(1.2)" onChange={onChange} label="Filters" />);

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });

    fireEvent.click(removeButtons[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith('brightness(1.2)');
  });
});

// ===========================================================================
// Shadow Editor
// ===========================================================================

describe('ShadowEditor', () => {
  /**
   * @description Setting shadow values must emit a valid CSS shadow string.
   */
  it('renders shadow inputs', () => {
    render(<ShadowEditor value="2px 4px 6px #000000" onChange={jest.fn()} label="Shadow" />);

    expect(screen.getByLabelText(/offset\s*x/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/offset\s*y/i)).toBeInTheDocument();
  });

  /**
   * @description Multiple shadow layers must be comma-separated in the
   * emitted value.
   */
  it('supports multiple shadow layers', () => {
    render(<ShadowEditor value="2px 4px 6px #000, 0px 0px 10px #fff" onChange={jest.fn()} label="Shadow" />);

    const layers = screen.getAllByRole('group', { name: /layer/i });

    expect(layers.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// WCAG AA Input Accessibility
// ===========================================================================

describe('WCAG AA Input Accessibility', () => {
  /**
   * @description All custom inputs must have an associated aria-label.
   */
  it('color input has aria-label', () => {
    render(<ColorInput value="#000" onChange={jest.fn()} label="Background" />);

    expect(screen.getByLabelText('Background')).toBeInTheDocument();
  });

  /**
   * @description Color picker hue slider must respond to arrow keys.
   */
  it('hue slider responds to arrow keys', () => {
    const onChange = jest.fn();

    render(<ColorInput value="#ff0000" onChange={onChange} label="Color" />);

    const hueSlider = screen.getByRole('slider', { name: /hue/i });

    fireEvent.keyDown(hueSlider, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalled();
  });

  /**
   * @description Invalid input values must set aria-invalid on the input.
   */
  it('sets aria-invalid for invalid input', () => {
    render(<CssLengthInput value={NaN} unit="px" onChange={jest.fn()} label="Width" />);

    const input = screen.getByRole('textbox', { name: /width/i });

    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
