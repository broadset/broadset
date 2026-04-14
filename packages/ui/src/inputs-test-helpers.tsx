/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import type * as React from 'react';

/* ---------- HeroUI mock (comprehensive for ColorInput, NumField, etc.) ---------- */

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
        DecrementButton(props: MockHeroUiProps): React.JSX.Element {
          const context = ReactActual.useContext(NumberFieldContext);

          return ReactActual.createElement(
            'button',
            {
              ...props,
              'aria-label': `Decrement ${context.label}`,
              onClick: () => {
                context.onChange?.(context.value - 1);
              },
            },
            props.children ?? null,
          );
        },
        IncrementButton(props: MockHeroUiProps): React.JSX.Element {
          const context = ReactActual.useContext(NumberFieldContext);

          return ReactActual.createElement(
            'button',
            {
              ...props,
              'aria-label': `Increment ${context.label}`,
              onClick: () => {
                context.onChange?.(context.value + 1);
              },
            },
            props.children ?? null,
          );
        },
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

    function createFragment(props: MockHeroUiProps): React.JSX.Element {
      return ReactActual.createElement(ReactActual.Fragment, null, props.children ?? null);
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
      {
        Trigger: createFragment,
        Value: createFragment,
        Indicator: createFragment,
        Popover: createFragment,
      },
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
      ListBox: Object.assign(createFragment, {
        Item: SelectItem,
        Section: createWrapper(),
        ItemIndicator: createWrapper('span'),
      }),
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
