/** @vitest-environment jsdom */

import type * as React from 'react';
import { vi } from 'vitest';

/* ---------- HeroUI mock (comprehensive for ColorInput, NumField, etc.) ----------
 *
 * SCOPE: unit-scope chrome only. Browser-critical behaviors (keyboard
 * nudge commits via Pressable, portal positioning for ColorInput, slider
 * drag pointer events) are validated against real HeroUI via Playwright
 * CT in `packages/demo/ct/accessibility/inputs-a11y.ct.tsx`. If a test
 * needs those semantics, it is a CT, not a unit test.
 * ------------------------------------------------------------------ */

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

vi.mock('@heroui/react', async () => {
  const ReactActual = await vi.importActual<typeof React>('react');
  const { buildCommonHeroUi } = await import('../testing/heroui-mock-common');

  function pickSafeDomProps(rest: Record<string, unknown>): Record<string, unknown> {
    const allowedKeys = new Set([
      'checked',
      'className',
      'disabled',
      'id',
      'max',
      'min',
      'name',
      'onBlur',
      'onChange',
      'onFocus',
      'onInput',
      'onKeyDown',
      'onKeyUp',
      'onMouseDown',
      'onMouseMove',
      'onMouseUp',
      'onPointerCancel',
      'onPointerDown',
      'onPointerMove',
      'onPointerUp',
      'placeholder',
      'role',
      'step',
      'style',
      'tabIndex',
      'type',
      'value',
    ]);

    const allowedEntries = Object.entries(rest).filter(([key]) => {
      if (key.startsWith('aria-') || key.startsWith('data-')) {
        return true;
      }

      return allowedKeys.has(key);
    });

    return Object.fromEntries(allowedEntries);
  }

  const common = buildCommonHeroUi(ReactActual, { sanitize: pickSafeDomProps });
  const { Button, createWrapper } = common;

    function Input(props: MockHeroUiProps): React.JSX.Element {
      const { label, onChange, value = '', ...rest } = props;
      const domProps = pickSafeDomProps(rest as Record<string, unknown>);

      return ReactActual.createElement('input', {
        ...domProps,
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
        const domProps = pickSafeDomProps(rest as Record<string, unknown>);

        return ReactActual.createElement(
          'div',
          domProps,
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
          const domProps = pickSafeDomProps(props as Record<string, unknown>);
          const propOnChange = (props as { readonly onChange?: unknown }).onChange;

          return ReactActual.createElement('input', {
            ...domProps,
            'aria-label': context.label,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
              if (typeof propOnChange === 'function') {
                (propOnChange as (event: React.ChangeEvent<HTMLInputElement>) => void)(event);
              }

              const numeric = Number(event.currentTarget.value);

              if (Number.isFinite(numeric)) {
                context.onChange?.(numeric);
              } else {
                context.onChange?.(Number.NaN);
              }
            },
            role: 'spinbutton',
            // HeroUI / react-aria-components render a type="text" input so
            // locale-aware parsing (e.g. decimal commas) can run. Using
            // type="number" in the mock swallows non-numeric drafts before
            // custom blur parsing ever sees them.
            type: 'text',
            value: String(context.value),
          });
        },
        DecrementButton(props: MockHeroUiProps): React.JSX.Element {
          const context = ReactActual.useContext(NumberFieldContext);
          const domProps = pickSafeDomProps(props as Record<string, unknown>);

          return ReactActual.createElement(
            'button',
            {
              ...domProps,
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
          const domProps = pickSafeDomProps(props as Record<string, unknown>);

          return ReactActual.createElement(
            'button',
            {
              ...domProps,
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
      const domProps = pickSafeDomProps(rest as Record<string, unknown>);

      return ReactActual.createElement(
        'div',
        {},
        ReactActual.createElement('input', {
          ...domProps,
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
      const domProps = pickSafeDomProps(rest as Record<string, unknown>);
      const switchOnChange = onChange as ((...args: [boolean]) => void) | undefined;

      return ReactActual.createElement(
        'label',
        domProps,
        ReactActual.createElement('input', {
          'aria-label': props['aria-label'] ?? (typeof children === 'string' ? children : ''),
          checked: Boolean(isSelected),
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            if (typeof switchOnChange === 'function') {
              switchOnChange(event.currentTarget.checked);
            }
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
        const domProps = pickSafeDomProps(rest as Record<string, unknown>);

        return ReactActual.createElement(
          'select',
          {
            ...domProps,
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
        const domProps = pickSafeDomProps(rest as Record<string, unknown>);
        const dataTestId = (rest as Record<string, unknown>)['data-testid'] ?? 'color-area';

        return ReactActual.createElement('div', { ...domProps, 'data-testid': dataTestId }, children ?? null);
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
        const domProps = pickSafeDomProps(rest as Record<string, unknown>);

        return ReactActual.createElement('div', domProps, children ?? null);
      },
      {
        Item: createWrapper(),
        Swatch: createWrapper('span'),
        Indicator: createWrapper('span'),
      },
    );

    function ColorSwatch(props: MockHeroUiProps): React.JSX.Element {
      const domProps = pickSafeDomProps(props as Record<string, unknown>);

      return ReactActual.createElement('div', domProps);
    }

    return {
      Button,
      Input,
      NumberField,
      Select,
      SelectItem,
      Slider,
      Switch: Object.assign(Switch, {
        Control: createWrapper('span'),
        Thumb: createWrapper('span'),
        Content: createWrapper('span'),
        Icon: createWrapper('span'),
      }),
      ButtonGroup: createWrapper(),
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
});
