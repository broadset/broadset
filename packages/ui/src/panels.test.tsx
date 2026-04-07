/** @jest-environment jsdom */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import type { PanelElement } from './panels';
import { AppearancePanel, GeometryPanel, PropertiesSidebar } from './panels';

interface MockHeroUiProps {
  readonly children?: React.ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly label?: string | undefined;
  readonly ['aria-label']?: string | undefined;
  readonly value?: string | number | readonly string[] | undefined;
  readonly selectedKey?: string | number | null | undefined;
  readonly onSelectionChange?: ((key: string | number | null) => void) | undefined;
  readonly onChange?: ((event: React.ChangeEvent<HTMLInputElement>) => void) | ((value: number) => void) | undefined;
  readonly [key: string]: unknown;
}

jest.mock(
  '@heroui/react',
  () => {
    const ReactActual = jest.requireActual<typeof React>('react');
    const NumberFieldContext = ReactActual.createContext<{
      readonly label: string;
      readonly value: number;
      readonly onChange?: ((value: number) => void) | undefined;
    }>({ label: '', onChange: undefined, value: 0 });

    function createWrapper(tagName = 'div') {
      return function Wrapper(props: MockHeroUiProps): React.JSX.Element {
        const {
          allowsMultipleExpanded: _allowsMultipleExpanded,
          children,
          defaultExpandedKeys: _defaultExpandedKeys,
          ...restProps
        } = props;

        return ReactActual.createElement(tagName, restProps, children ?? null);
      };
    }

    function Button(props: MockHeroUiProps): React.JSX.Element {
      const { children, isDisabled, onPress, ...restProps } = props;

      return ReactActual.createElement(
        'button',
        { ...restProps, disabled: isDisabled, onClick: typeof onPress === 'function' ? onPress : undefined },
        children ?? null,
      );
    }

    const Accordion = Object.assign(createWrapper(), {
      Item: createWrapper(),
      Heading: createWrapper(),
      Trigger: Button,
      Panel: createWrapper(),
    });

    function Input(props: MockHeroUiProps): React.JSX.Element {
      const { label, onChange, value = '', ...restProps } = props;

      return ReactActual.createElement(
        'label',
        null,
        label ?? null,
        ReactActual.createElement('input', {
          ...restProps,
          'aria-label': props['aria-label'] ?? label,
          onChange: typeof onChange === 'function' ? onChange : undefined,
          value,
        }),
      );
    }

    const NumberField = Object.assign(
      function NumberFieldRoot(props: MockHeroUiProps): React.JSX.Element {
        const {
          children,
          label,
          maxValue: _maxValue,
          minValue: _minValue,
          onChange,
          step: _step,
          value = 0,
          ...restProps
        } = props;

        return ReactActual.createElement(
          'div',
          restProps,
          ReactActual.createElement(
            NumberFieldContext.Provider,
            {
              value: {
                label: props['aria-label'] ?? label ?? '',
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

              if (typeof props.onChange === 'function') {
                (props.onChange as (event: React.ChangeEvent<HTMLInputElement>) => void)(event);
              }
            },
            role: 'spinbutton',
            type: 'number',
            value: String(context.value),
          });
        },
      },
    );

    const Select = Object.assign(createWrapper(), {
      Trigger: createWrapper(),
      Value: createWrapper('span'),
      Popover: createWrapper(),
    });

    return {
      Accordion,
      Button,
      Input,
      ListBox: createWrapper(),
      ListBoxItem: createWrapper(),
      NumberField,
      Select,
    };
  },
  { virtual: true },
);

const RECTANGLE_ELEMENT: PanelElement = {
  id: 'element-1',
  type: 'rectangle',
  name: 'Hero Card',
  x: 20,
  y: 30,
  width: 320,
  height: 180,
  rotation: 15,
  backgroundColor: '#ff0000',
  backgroundGradient: 'linear-gradient(90deg, #ff0000, #0000ff)',
  borderWidth: 2,
  borderColor: '#111111',
  borderStyle: 'solid',
  borderRadius: 12,
  opacity: 0.8,
  blendMode: 'normal',
  boxShadow: '2px 4px 8px rgba(0,0,0,0.3)',
  filter: 'blur(2px)',
  backdropFilter: 'blur(6px)',
};

describe('GeometryPanel', () => {
  /** @description Position, size, and rotation fields are the core property controls and must report changes as numbers for real-time canvas updates. */
  it('renders geometry inputs and reports numeric updates', () => {
    const onUpdate = jest.fn<(key: string, value: number) => void>();

    render(<GeometryPanel x={10} y={20} width={100} height={50} rotation={5} onUpdate={onUpdate} />);

    const xInput = screen.getByRole('spinbutton', { name: 'X' });

    fireEvent.change(xInput, { target: { value: '42' } });

    expect(screen.getByRole('spinbutton', { name: 'Width' })).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: 'Rotation' })).not.toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('x', 42);
  });
});

describe('AppearancePanel', () => {
  /** @description Opacity is part of the Phase 4 basic properties set and must update through the shared callback contract. */
  it('renders opacity controls and forwards updates', () => {
    const onUpdate = jest.fn<(key: string, value: string | number) => void>();

    render(
      <AppearancePanel
        backgroundColor="#ffffff"
        borderWidth={1}
        borderColor="#000000"
        borderStyle="solid"
        borderRadius={6}
        opacity={0.75}
        blendMode="normal"
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Opacity' }), { target: { value: '0.5' } });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('opacity', 0.5);
  });
});

describe('PropertiesSidebar', () => {
  /** @description Screen-mode rectangles must expose the gradient field so users can configure richer fills in the main properties sidebar. */
  it('shows the gradient section for rectangle elements in screen mode', () => {
    render(<PropertiesSidebar element={RECTANGLE_ELEMENT} documentMode="screen" onUpdate={() => undefined} />);

    expect(screen.getByText('Geometry')).not.toBeNull();
    expect(screen.getByText('Appearance')).not.toBeNull();
    expect(screen.getByText('Gradient Fill')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /css gradient/i })).not.toBeNull();
  });

  /** @description Print mode must hide screen-only gradient controls to keep the sidebar aligned with print-safe styling constraints. */
  it('hides the gradient section in print mode', () => {
    render(<PropertiesSidebar element={RECTANGLE_ELEMENT} documentMode="print" onUpdate={() => undefined} />);

    expect(screen.queryByText('Gradient Fill')).toBeNull();
    expect(screen.queryByRole('textbox', { name: /css gradient/i })).toBeNull();
  });

  /** @description The properties sidebar must support plugin-owned property panels and also provide an explicit empty state when nothing is selected. */
  it('renders a custom panel override and an empty-state message when no element is selected', () => {
    const CountdownPanel = (): React.JSX.Element => <p>Countdown controls</p>;

    const { rerender } = render(
      <PropertiesSidebar
        element={{ ...RECTANGLE_ELEMENT, type: 'countdown' }}
        documentMode="screen"
        onUpdate={() => undefined}
        customPanels={{ countdown: CountdownPanel }}
      />,
    );

    expect(screen.getByText('Countdown controls')).not.toBeNull();

    rerender(<PropertiesSidebar element={null} documentMode="screen" onUpdate={() => undefined} />);
    expect(screen.getByText(/select an element to edit its properties/i)).not.toBeNull();
  });
});
