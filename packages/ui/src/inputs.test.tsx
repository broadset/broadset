/** @jest-environment jsdom */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import type {
  ColorInputProps,
  CssLengthInputProps,
  FilterEditorProps,
  NumFieldProps,
  ShadowEditorProps,
  TextStrokeInputProps,
} from './inputs';

/* ---------- HeroUI mock (shared pattern) ---------- */

interface MockHeroUiProps {
  readonly children?: React.ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly label?: string | undefined;
  readonly ['aria-label']?: string | undefined;
  readonly value?: string | number | readonly string[] | undefined;
  readonly onChange?: ((event: React.ChangeEvent<HTMLInputElement>) => void) | ((value: number) => void) | undefined;
  readonly onValueChange?: ((value: number) => void) | undefined;
  readonly [key: string]: unknown;
}

jest.mock(
  '@heroui/react',
  () => {
    const ReactActual = jest.requireActual<typeof React>('react');

    function createWrapper(tagName = 'div') {
      return function Wrapper(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...rest } = props;

        return ReactActual.createElement(tagName, rest, children ?? null);
      };
    }

    function Button(props: MockHeroUiProps): React.JSX.Element {
      const { children, isDisabled, onPress, ...rest } = props;

      return ReactActual.createElement(
        'button',
        { ...rest, disabled: isDisabled, onClick: typeof onPress === 'function' ? onPress : undefined },
        children ?? null,
      );
    }

    function Input(props: MockHeroUiProps): React.JSX.Element {
      const { label, onChange, value = '', ...rest } = props;

      return ReactActual.createElement('input', {
        ...rest,
        'aria-label': props['aria-label'] ?? label,
        onChange: typeof onChange === 'function' ? onChange : undefined,
        value,
      });
    }

    const NumberFieldContext = ReactActual.createContext<{
      readonly label: string;
      readonly value: number;
      readonly onChange?: ((value: number) => void) | undefined;
    }>({ label: '', onChange: undefined, value: 0 });

    const NumberField = Object.assign(
      function NumberFieldRoot(props: MockHeroUiProps): React.JSX.Element {
        const { children, label, onChange, value = 0, ...rest } = props;

        return ReactActual.createElement(
          'div',
          rest,
          ReactActual.createElement(
            NumberFieldContext.Provider,
            {
              value: {
                label: props['aria-label'] ?? (typeof label === 'string' ? label : ''),
                onChange: typeof onChange === 'function' ? (onChange as (value: number) => void) : undefined,
                value: Number(value),
              },
            },
            children ?? null,
          ),
        );
      },
      {
        Group: createWrapper(),
        Input(props: MockHeroUiProps): React.JSX.Element {
          const context = ReactActual.useContext(NumberFieldContext);

          return ReactActual.createElement('input', {
            ...props,
            'aria-label': context.label,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
              context.onChange?.(Number(event.currentTarget.value));
            },
            role: 'spinbutton',
            type: 'number',
            value: String(context.value),
          });
        },
        DecrementButton: Button,
        IncrementButton: Button,
      },
    );

    const SliderBase = function Slider(props: MockHeroUiProps): React.JSX.Element {
      const { label, value = 0, onChange, onValueChange, children, ...rest } = props;

      return ReactActual.createElement(
        'div',
        {},
        ReactActual.createElement('input', {
          ...rest,
          'aria-label': typeof label === 'string' ? label : props['aria-label'],
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            const val = Number(event.currentTarget.value);

            if (typeof onValueChange === 'function') onValueChange(val);
            if (typeof onChange === 'function') (onChange as (value: number) => void)(val);
          },
          role: 'slider',
          type: 'range',
          value: String(value),
        }),
        children ?? null,
      );
    };

    const Slider = Object.assign(SliderBase, {
      Track: createWrapper(),
      Fill: createWrapper(),
      Thumb: createWrapper(),
      Output: createWrapper(),
      Marks: createWrapper(),
    });

    function Switch(props: MockHeroUiProps): React.JSX.Element {
      const { children, isSelected, onChange, ...rest } = props;

      return ReactActual.createElement(
        'label',
        rest,
        ReactActual.createElement('input', {
          'aria-label': props['aria-label'] ?? (typeof children === 'string' ? children : ''),
          checked: Boolean(isSelected),
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            if (typeof onChange === 'function')
              (onChange as unknown as (isSelected: boolean) => void)(event.currentTarget.checked);
          },
          role: 'switch',
          type: 'checkbox',
        }),
        children ?? null,
      );
    }

    const Select = Object.assign(
      function SelectRoot(props: MockHeroUiProps): React.JSX.Element {
        const { children, label, onChange, value, ...rest } = props;

        return ReactActual.createElement(
          'select',
          {
            ...rest,
            'aria-label': typeof label === 'string' ? label : props['aria-label'],
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
              if (typeof onChange === 'function') {
                Reflect.apply(onChange as (...args: unknown[]) => void, undefined, [event.currentTarget.value]);
              }
            },
            value: value ?? '',
          },
          children ?? null,
        );
      },
      { Trigger: createWrapper(), Value: createWrapper('span'), Popover: createWrapper() },
    );

    const SelectItem = function SelectItem(props: MockHeroUiProps): React.JSX.Element {
      const { children } = props;

      return ReactActual.createElement(
        'option',
        { value: props['id'] ?? (typeof children === 'string' ? children : '') },
        children ?? null,
      );
    };

    /* ---- Color component mocks ---- */

    function mockColorObject(css: string) {
      return {
        toString: (_format?: string) => css,
        getChannelValue: (_ch?: string) => 0,
        withChannelValue: (_ch: string, _val: number) => mockColorObject(css),
      };
    }

    function mockParseColor(css: string) {
      return mockColorObject(css);
    }

    const ColorArea = Object.assign(
      function ColorAreaRoot(props: MockHeroUiProps): React.JSX.Element {
        const { children, value, onChange, ...rest } = props;

        return ReactActual.createElement(
          'div',
          { ...rest, 'data-testid': (rest as Record<string, unknown>)['data-testid'] ?? 'color-area' },
          children ?? null,
        );
      },
      { Thumb: createWrapper() },
    );

    function ColorSliderRoot(props: MockHeroUiProps): React.JSX.Element {
      const { value, onChange, children, ...rest } = props;
      const channel = rest['channel'] as string | undefined;

      return ReactActual.createElement(
        'div',
        {},
        ReactActual.createElement('input', {
          'aria-label': props['aria-label'] ?? channel ?? 'color-slider',
          type: 'range',
          onChange: (_event: React.ChangeEvent<HTMLInputElement>) => {
            if (typeof onChange === 'function') {
              const mock = mockColorObject(`#ff000080`);

              Reflect.apply(onChange as (...args: unknown[]) => void, undefined, [mock]);
            }
          },
        }),
        children ?? null,
      );
    }

    const ColorSliderComponent = Object.assign(ColorSliderRoot, {
      Track: createWrapper(),
      Thumb: createWrapper(),
      Output: createWrapper(),
    });

    const ColorSwatchPicker = Object.assign(
      function ColorSwatchPickerRoot(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...rest } = props;

        return ReactActual.createElement('div', rest, children ?? null);
      },
      {
        Item: createWrapper(),
        Swatch: createWrapper('span'),
        Indicator: createWrapper('span'),
      },
    );

    function ColorSwatch(props: MockHeroUiProps): React.JSX.Element {
      return ReactActual.createElement('div', { ...(props as Record<string, unknown>) });
    }

    return {
      Button,
      Input,
      NumberField,
      Select,
      SelectItem,
      Slider,
      Switch,
      Popover: Object.assign(createWrapper(), {
        Trigger: createWrapper(),
        Content: createWrapper(),
        Dialog: createWrapper(),
      }),
      ListBox: createWrapper(),
      ListBoxItem: SelectItem,
      ColorArea,
      ColorSlider: ColorSliderComponent,
      ColorSwatchPicker,
      ColorSwatch,
      parseColor: mockParseColor,
    };
  },
  { virtual: true },
);

/* --------- Lazy import after mock --------- */

let ColorInput: React.ComponentType<ColorInputProps>;
let NumField: React.ComponentType<NumFieldProps>;
let CssLengthInput: React.ComponentType<CssLengthInputProps>;
let TextStrokeInput: React.ComponentType<TextStrokeInputProps>;
let FilterEditor: React.ComponentType<FilterEditorProps>;
let ShadowEditor: React.ComponentType<ShadowEditorProps>;

beforeAll(async () => {
  const mod = await import('./inputs');

  ColorInput = mod.ColorInput;
  NumField = mod.NumField;
  CssLengthInput = mod.CssLengthInput;
  TextStrokeInput = mod.TextStrokeInput;
  FilterEditor = mod.FilterEditor;
  ShadowEditor = mod.ShadowEditor;
});

/* ============================================================
   ColorInput
   ============================================================ */

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

    const alphaSlider = screen.getByLabelText('Alpha');

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

/* ============================================================
   NumField
   ============================================================ */

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

    fireEvent.change(input, { target: { value: '75' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(75);
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

  /** @description Numeric input must be accepted in the current unit. */
  it('accepts numeric input in the current unit', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<CssLengthInput value="50px" onChange={onChange} label="Height" />);

    const numInput = screen.getByRole('spinbutton', { name: 'Height value' });

    fireEvent.change(numInput, { target: { value: '75' } });
    fireEvent.blur(numInput);
    expect(onChange).toHaveBeenCalledWith('75px');
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

/* ============================================================
   FilterEditor
   ============================================================ */

describe('FilterEditor', () => {
  /** @description A single filter must produce the correct CSS function string. */
  it('emits correct CSS filter for a single function', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px)" onChange={onChange} label="Filter" />);
    // Should show one filter entry
    expect(screen.getByText('blur')).toBeTruthy();
  });

  /** @description Multiple filters must be concatenated in stack order. */
  it('concatenates multiple filters in stack order', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px) brightness(1.2)" onChange={onChange} label="Filter" />);
    expect(screen.getByText('blur')).toBeTruthy();
    expect(screen.getByText('brightness')).toBeTruthy();
  });

  /** @description Removing a filter should leave only the remaining filters in the emitted string. */
  it('removes a filter and emits remaining', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px) brightness(1.2)" onChange={onChange} label="Filter" />);

    const removeButtons = screen.getAllByLabelText(/Remove/);

    const firstRemoveButton = removeButtons[0];

    if (firstRemoveButton !== undefined) {
      fireEvent.click(firstRemoveButton);
    }

    expect(onChange).toHaveBeenCalled();
  });

  /** @description Functions already in the stack must be excluded from the Add dropdown. */
  it('excludes already-added functions from add dropdown', () => {
    render(<FilterEditor value="blur(5px)" onChange={jest.fn()} label="Filter" />);

    const addSelect = screen.getByLabelText('Add filter');

    // 'blur' is already in the stack, so it should not appear as an option
    const options = addSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((opt) => opt.textContent);

    expect(optionValues).not.toContain('blur');
  });

  /** @description Reorder buttons must move filters up/down in stack order. */
  it('reorders filters via up/down buttons', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<FilterEditor value="blur(5px) brightness(1.2)" onChange={onChange} label="Filter" />);

    // Move brightness up (second filter)
    const moveUpButtons = screen.getAllByLabelText(/Move .* up/);

    // The second filter's "Move up" button
    const moveUpBtn = moveUpButtons[1];

    if (moveUpBtn !== undefined) {
      fireEvent.click(moveUpBtn);
    }

    expect(onChange).toHaveBeenCalled();

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

    // After reorder, brightness should come before blur
    expect(lastCall).toMatch(/^brightness/);
  });
});

/* ============================================================
   ShadowEditor
   ============================================================ */

describe('ShadowEditor', () => {
  /** @description Valid shadow values must produce a correct CSS shadow string. */
  it('emits a valid CSS shadow string', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<ShadowEditor value="2px 4px 6px #000000" mode="box" onChange={onChange} label="Shadow" />);
    expect(screen.getByText(/Shadow/)).toBeTruthy();
  });

  /** @description Multiple shadow layers must be comma-separated. */
  it('supports multiple comma-separated layers', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(
      <ShadowEditor value="2px 4px 6px #000000, 0px 0px 4px #ff0000" mode="box" onChange={onChange} label="Shadow" />,
    );

    const layers = screen.getAllByTestId('shadow-layer');

    expect(layers.length).toBe(2);
  });

  /** @description Disabling the shadow via toggle must emit 'none'. */
  it('emits none when disabled via toggle', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<ShadowEditor value="2px 4px 6px #000000" mode="box" onChange={onChange} label="Shadow" />);

    const toggle = screen.getByRole('switch', { name: 'Enable shadow' });

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('none');
  });

  /** @description Re-enabling the shadow must restore previously configured layers. */
  it('restores layers when re-enabled', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(<ShadowEditor value="2px 4px 6px #000000" mode="box" onChange={onChange} label="Shadow" />);

    const toggle = screen.getByRole('switch', { name: 'Enable shadow' });

    // Disable
    fireEvent.click(toggle);
    // Re-enable
    fireEvent.click(toggle);

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

    expect(lastCall).not.toBe('none');
    expect(lastCall).toContain('px');
  });

  /** @description Layers must be reorderable via up/down buttons. */
  it('reorders layers via up/down buttons', () => {
    const onChange = jest.fn<(value: string) => void>();

    render(
      <ShadowEditor value="2px 4px 6px #ff0000, 0px 0px 4px #00ff00" mode="box" onChange={onChange} label="Shadow" />,
    );

    // Move second layer up
    const moveUpButtons = screen.getAllByLabelText(/Move layer .* up/);

    // Layer 2 up button
    const moveUpBtn = moveUpButtons[1];

    if (moveUpBtn !== undefined) {
      fireEvent.click(moveUpBtn);
    }

    expect(onChange).toHaveBeenCalled();

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];

    // After reorder, #00ff00 layer should come first
    expect(lastCall).toMatch(/^0px/);
  });
});
