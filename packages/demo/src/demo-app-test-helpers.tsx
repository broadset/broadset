/** @jest-environment jsdom */

import type * as React from 'react';

interface MockHeroUiProps {
  readonly children?: React.ReactNode;
  readonly isDisabled?: boolean | undefined;
  readonly onAction?: (() => void) | undefined;
  readonly onChange?:
    | ((event: React.ChangeEvent<HTMLInputElement>) => void)
    | ((value: boolean) => void)
    | ((value: number) => void)
    | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly onSelectionChange?: ((key: string | number | null) => void) | undefined;
  readonly selectedKey?: string | number | null | undefined;
  readonly startContent?: React.ReactNode;
  readonly value?: string | number | readonly string[] | undefined;
  readonly [key: string]: unknown;
}

jest.mock(
  '@heroui/react',
  () => {
    const ReactActual: typeof React = jest.requireActual('react');
    const TabsContext = ReactActual.createContext<{
      readonly onSelectionChange?: ((key: string | number | null) => void) | undefined;
      readonly selectedKey: string;
    }>({ onSelectionChange: undefined, selectedKey: '' });
    const NumberFieldContext = ReactActual.createContext<{
      readonly label: string;
      readonly onChange?: ((value: number) => void) | undefined;
      readonly value: number;
    }>({ label: '', onChange: undefined, value: 0 });

    function createWrapper(tagName = 'div') {
      return function Wrapper(props: MockHeroUiProps): React.JSX.Element {
        const {
          allowsMultipleExpanded: _allowsMultipleExpanded,
          children,
          defaultExpandedKeys: _defaultExpandedKeys,
          isIconOnly: _isIconOnly,
          ...restProps
        } = props;

        return ReactActual.createElement(tagName, restProps, children ?? null);
      };
    }

    const Button = (props: MockHeroUiProps): React.JSX.Element => {
      const { children, isDisabled, isIconOnly: _isIconOnly, onPress, startContent, ...restProps } = props;
      const onClick = typeof onPress === 'function' ? onPress : undefined;

      return ReactActual.createElement(
        'button',
        { ...restProps, disabled: isDisabled, onClick },
        startContent ?? null,
        children ?? null,
      );
    };

    const Tabs = Object.assign(
      function TabsRoot(props: MockHeroUiProps): React.JSX.Element {
        const { children, onSelectionChange, selectedKey, ...restProps } = props;

        return ReactActual.createElement(
          'div',
          restProps,
          ReactActual.createElement(
            TabsContext.Provider,
            { value: { onSelectionChange, selectedKey: String(selectedKey ?? '') } },
            children ?? null,
          ),
        );
      },
      {
        List: createWrapper(),
        Tab(props: MockHeroUiProps): React.JSX.Element {
          const { children, id, ...restProps } = props;
          const context = ReactActual.useContext(TabsContext);
          const tabId = typeof id === 'number' || typeof id === 'string' ? String(id) : '';

          return ReactActual.createElement(
            'button',
            {
              ...restProps,
              'aria-selected': String(context.selectedKey === tabId),
              onClick: () => {
                context.onSelectionChange?.(tabId);
              },
              role: 'tab',
            },
            children ?? null,
          );
        },
      },
    );

    const Accordion = Object.assign(createWrapper(), {
      Heading: createWrapper(),
      Item: createWrapper(),
      Panel: createWrapper(),
      Trigger: Button,
    });

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
        const resolvedLabel =
          typeof props['aria-label'] === 'string' ? props['aria-label']
          : typeof label === 'string' ? label
          : '';

        return ReactActual.createElement(
          'div',
          restProps,
          ReactActual.createElement(
            NumberFieldContext.Provider,
            {
              value: {
                label: resolvedLabel,
                onChange: typeof onChange === 'function' ? (onChange as (value: number) => void) : undefined,
                value: Number(value),
              },
            },
            children ?? null,
          ),
        );
      },
      {
        DecrementButton: Button,
        Group: createWrapper(),
        IncrementButton: Button,
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
      },
    );

    const Tooltip = Object.assign(createWrapper(), {
      Content: createWrapper('span'),
      Trigger: createWrapper(),
    });

    const Dropdown = Object.assign(createWrapper(), {
      Item(props: MockHeroUiProps): React.JSX.Element {
        const { children, isDisabled, onAction, onPress, ...restProps } = props;

        return ReactActual.createElement(
          'button',
          {
            ...restProps,
            disabled: isDisabled,
            onClick: () => {
              onAction?.();
              onPress?.();
            },
          },
          children ?? null,
        );
      },
      Menu(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;

        return ReactActual.createElement('div', { role: 'menu', ...restProps }, children ?? null);
      },
      Popover: createWrapper(),
      Trigger: createWrapper(),
    });

    const Select = Object.assign(createWrapper(), {
      Indicator: createWrapper('span'),
      Popover: createWrapper(),
      Trigger: createWrapper(),
      Value: createWrapper('span'),
    });

    const Kbd = Object.assign(createWrapper('kbd'), {
      Abbr: createWrapper('abbr'),
      Content: createWrapper('span'),
    });

    const Modal = Object.assign(
      function ModalRoot(props: MockHeroUiProps): React.JSX.Element | null {
        const { children, isOpen = true, onOpenChange: _onOpenChange, ...restProps } = props;

        if (isOpen === false) {
          return null;
        }

        return ReactActual.createElement('div', restProps, children ?? null);
      },
      {
        Backdrop(props: MockHeroUiProps): React.JSX.Element | null {
          const {
            children,
            isDismissable: _isDismissable,
            isOpen = true,
            onOpenChange: _onOpenChange,
            ...restProps
          } = props;

          if (isOpen === false) {
            return null;
          }

          return ReactActual.createElement('div', restProps, children ?? null);
        },
        Body: createWrapper(),
        CloseTrigger: Button,
        Container: createWrapper(),
        Dialog(props: MockHeroUiProps): React.JSX.Element {
          const { children, ...restProps } = props;

          return ReactActual.createElement('div', { role: 'dialog', ...restProps }, children ?? null);
        },
        Footer: createWrapper(),
        Header: createWrapper(),
        Heading: createWrapper('h2'),
      },
    );

    const toastSubscribers = new Set<() => void>();
    let toastEntries: Array<{
      readonly description?: React.ReactNode;
      readonly id: string;
      readonly message: React.ReactNode;
    }> = [];

    const emitToastChange = (): void => {
      for (const subscriber of toastSubscribers) {
        subscriber();
      }
    };

    const addToast = (message: React.ReactNode, description?: React.ReactNode): string => {
      const toastId = `toast-${String(toastEntries.length + 1)}`;

      toastEntries = [{ description, id: toastId, message }, ...toastEntries];
      emitToastChange();

      return toastId;
    };

    const toastApi = {
      clear: (): void => {
        toastEntries = [];
        emitToastChange();
      },
      close: (id: string): void => {
        toastEntries = toastEntries.filter((entry) => entry.id !== id);
        emitToastChange();
      },
      danger: (message: React.ReactNode, options?: { readonly description?: React.ReactNode }): string =>
        addToast(message, options?.description),
      info: (message: React.ReactNode, options?: { readonly description?: React.ReactNode }): string =>
        addToast(message, options?.description),
      pauseAll: (): void => undefined,
      resumeAll: (): void => undefined,
      success: (message: React.ReactNode, options?: { readonly description?: React.ReactNode }): string =>
        addToast(message, options?.description),
      warning: (message: React.ReactNode, options?: { readonly description?: React.ReactNode }): string =>
        addToast(message, options?.description),
    };

    const ToastComponent = Object.assign(
      function ToastRoot(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;

        return ReactActual.createElement('div', { role: 'status', ...restProps }, children ?? null);
      },
      {
        CloseButton: Button,
        Description: createWrapper('span'),
        Provider(props: MockHeroUiProps): React.JSX.Element {
          const { children, ...restProps } = props;
          const [entries, setEntries] = ReactActual.useState(toastEntries);

          ReactActual.useEffect(() => {
            const handleChange = (): void => {
              setEntries([...toastEntries]);
            };

            toastSubscribers.add(handleChange);

            return () => {
              toastSubscribers.delete(handleChange);
            };
          }, []);

          return ReactActual.createElement(
            'div',
            { ...restProps, 'data-testid': 'hero-toast-provider' },
            children ?? null,
            ...entries.map((entry) =>
              ReactActual.createElement(
                'div',
                { key: entry.id, role: 'status' },
                ReactActual.createElement('strong', null, entry.message),
                entry.description === undefined ? null : ReactActual.createElement('span', null, entry.description),
              ),
            ),
          );
        },
        Title: createWrapper('strong'),
        toast: toastApi,
      },
    );

    return {
      Accordion,
      Button,
      ButtonGroup: createWrapper(),
      Card: createWrapper(),
      CardContent: createWrapper(),
      CardDescription: createWrapper('p'),
      CardHeader: createWrapper(),
      CardTitle: createWrapper('h2'),
      Chip: createWrapper('span'),
      CloseButton: Button,
      ColorArea: Object.assign(createWrapper(), { Thumb: createWrapper('span') }),
      ColorSlider: Object.assign(createWrapper(), { Thumb: createWrapper('span'), Track: createWrapper() }),
      ColorSwatch: createWrapper('span'),
      ColorSwatchPicker: Object.assign(createWrapper(), { Item: createWrapper(), Swatch: createWrapper('span') }),
      Dropdown,
      Input(props: MockHeroUiProps): React.JSX.Element {
        const { onChange, value = '', ...restProps } = props;

        return ReactActual.createElement('input', {
          ...restProps,
          onChange: typeof onChange === 'function' ? onChange : undefined,
          value,
        });
      },
      Kbd,
      ListBox: Object.assign(createWrapper(), { Item: createWrapper() }),
      ListBoxItem: createWrapper(),
      Modal,
      NumberField,
      parseColor: (mockColorStr: string) => ({
        getChannelValue: () => 0,
        toString: () => mockColorStr,
        withChannelValue: () => ({
          getChannelValue: () => 0,
          toString: () => mockColorStr,
          withChannelValue: (): unknown => null,
        }),
      }),
      Popover: Object.assign(createWrapper(), {
        Content: createWrapper(),
        Dialog: createWrapper(),
        Trigger: createWrapper(),
      }),
      ScrollShadow: createWrapper(),
      Select,
      Separator: createWrapper('hr'),
      Slider: Object.assign(
        function SliderRoot(props: MockHeroUiProps): React.JSX.Element {
          const { children, onChange, ...restProps } = props;

          return ReactActual.createElement(
            'div',
            { ...restProps, role: 'group' },
            ReactActual.createElement('input', {
              'aria-label': props['aria-label'],
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                if (typeof onChange === 'function') {
                  (onChange as (mockValue: number) => void)(Number(event.currentTarget.value));
                }
              },
              type: 'range',
              value: String(Number(props['value'] ?? 0)),
            }),
            children ?? null,
          );
        },
        { Fill: createWrapper('span'), Thumb: createWrapper('span'), Track: createWrapper() },
      ),
      Switch(props: MockHeroUiProps): React.JSX.Element {
        const { children, isSelected, onChange, ...restProps } = props;

        return ReactActual.createElement(
          'label',
          restProps,
          ReactActual.createElement('input', {
            'aria-label': props['aria-label'],
            checked: Boolean(isSelected),
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
              if (typeof onChange === 'function') {
                (onChange as (mockChecked: boolean) => void)(event.currentTarget.checked);
              }
            },
            role: 'switch',
            type: 'checkbox',
          }),
          children ?? null,
        );
      },
      Table: Object.assign(createWrapper('table'), {
        Body: createWrapper('tbody'),
        Cell: createWrapper('td'),
        Column: createWrapper('th'),
        Content: createWrapper(),
        Header: createWrapper('thead'),
        Row: createWrapper('tr'),
      }),
      Tabs,
      Toast: ToastComponent,
      Toolbar(props: MockHeroUiProps): React.JSX.Element {
        const { children, isAttached: _isAttached, ...restProps } = props;

        return ReactActual.createElement('div', { role: 'toolbar', ...restProps }, children ?? null);
      },
      Tooltip,
      toast: toastApi,
    };
  },
  { virtual: true },
);

jest.mock('@broadset/renderer', () => ({
  createScreenRenderer: jest.fn(),
}));

jest.mock('@broadset/playback', () => ({
  createPlaybackController: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();

  const heroui: { readonly toast?: { readonly clear: () => void } } = jest.requireMock('@heroui/react');

  heroui.toast?.clear();

  const rootElement = document.getElementById('root') ?? document.body.appendChild(document.createElement('div'));

  rootElement.id = 'root';
  rootElement.style.height = 'auto';
  rootElement.style.overflow = 'visible';
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.height = 'auto';
  document.documentElement.style.overflow = 'visible';
  document.body.style.height = 'auto';
  document.body.style.margin = '8px';
  document.body.style.overflow = 'visible';
});
