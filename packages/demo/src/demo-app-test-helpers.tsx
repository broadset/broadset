/** @vitest-environment jsdom */

import type {
  buildCommonHeroUi,
  CommonHeroUi,
  CommonHeroUiProps,
  PropSanitizer,
} from '@broadset/ui/testing/heroui-mock-common';
import type * as React from 'react';
import { beforeEach, vi } from 'vitest';

type BuildCommonHeroUi = typeof buildCommonHeroUi;
type HeroUiComponent = (props: MockHeroUiProps) => React.JSX.Element;

interface MockHeroUiProps extends CommonHeroUiProps {
  readonly onAction?: (() => void) | undefined;
  readonly onChange?:
    | ((event: React.ChangeEvent<HTMLInputElement>) => void)
    | ((value: boolean) => void)
    | ((value: number) => void)
    | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly onSelectionChange?: ((key: string | number | null) => void) | undefined;
  readonly selectedKey?: string | number | null | undefined;
}

vi.mock('@heroui/react', async () => {
  const ReactActual: typeof React = await vi.importActual('react');
  const commonModule = (await import('@broadset/ui/testing/heroui-mock-common')) as {
    readonly buildCommonHeroUi: BuildCommonHeroUi;
  };
  const TabsContext = ReactActual.createContext<{
    readonly onSelectionChange?: ((key: string | number | null) => void) | undefined;
    readonly selectedKey: string;
  }>({ onSelectionChange: undefined, selectedKey: '' });
  const NumberFieldContext = ReactActual.createContext<{
    readonly label: string;
    readonly onChange?: ((value: number) => void) | undefined;
    readonly value: number;
  }>({ label: '', onChange: undefined, value: 0 });
  const TableContext = ReactActual.createContext<{
    readonly onRowAction?: ((key: string) => void) | undefined;
  }>({ onRowAction: undefined });

  const ALLOWED_EVENT_PROPS = new Set([
    'onBlur',
    'onChange',
    'onClick',
    'onFocus',
    'onInput',
    'onKeyDown',
    'onKeyUp',
    'onMouseDown',
    'onMouseUp',
    'onSubmit',
  ]);

  const ALLOWED_STANDARD_PROPS = new Set([
    'aria-describedby',
    'aria-label',
    'aria-labelledby',
    'aria-selected',
    'checked',
    'className',
    'disabled',
    'id',
    'name',
    'placeholder',
    'placement',
    'role',
    'style',
    'tabIndex',
    'title',
    'type',
    'value',
  ]);

  const shouldForwardProp = (propName: string): boolean => {
    if (propName.startsWith('data-')) {
      return true;
    }

    if (propName.startsWith('aria-')) {
      return true;
    }

    return ALLOWED_EVENT_PROPS.has(propName) || ALLOWED_STANDARD_PROPS.has(propName);
  };

  const sanitizeDomProps: PropSanitizer = (props) => {
    return Object.entries(props).reduce<Record<string, unknown>>((sanitizedProps, [propName, propValue]) => {
      if (!shouldForwardProp(propName)) {
        return sanitizedProps;
      }

      sanitizedProps[propName] = propValue;

      return sanitizedProps;
    }, {});
  };

  const common: CommonHeroUi = commonModule.buildCommonHeroUi(ReactActual, { sanitize: sanitizeDomProps });
  const Button: HeroUiComponent = common.Button;
  const createWrapper: CommonHeroUi['createWrapper'] = common.createWrapper;

  const Tabs = Object.assign(
    function TabsRoot(props: MockHeroUiProps): React.JSX.Element {
      const { children, onSelectionChange, selectedKey, ...restProps } = props;
      const domProps = sanitizeDomProps(restProps);

      return ReactActual.createElement(
        'div',
        domProps,
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
        const { children, id, isDisabled, ...restProps } = props;
        const context = ReactActual.useContext(TabsContext);
        const tabId = typeof id === 'number' || typeof id === 'string' ? String(id) : '';
        const domProps = sanitizeDomProps(restProps);

        return ReactActual.createElement(
          'button',
          {
            ...domProps,
            'aria-selected': String(context.selectedKey === tabId),
            disabled: Boolean(isDisabled),
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
        isDisabled: _isDisabled,
        label,
        maxValue: _maxValue,
        minValue: _minValue,
        onChange,
        step: _step,
        value = 0,
        ...restProps
      } = props;
      const ariaLabel = typeof props['aria-label'] === 'string' ? props['aria-label'] : null;
      const labelString = typeof label === 'string' ? label : '';
      const resolvedLabel = ariaLabel ?? labelString;
      const domProps = sanitizeDomProps(restProps);

      return ReactActual.createElement(
        'div',
        domProps,
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
      const domProps = sanitizeDomProps(restProps);

      return ReactActual.createElement(
        'button',
        {
          ...domProps,
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
      const domProps = sanitizeDomProps(restProps);

      return ReactActual.createElement('div', { role: 'menu', ...domProps }, children ?? null);
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
      const domProps = sanitizeDomProps(restProps);

      if (isOpen === false) {
        return null;
      }

      return ReactActual.createElement('div', domProps, children ?? null);
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
        const domProps = sanitizeDomProps(restProps);

        if (isOpen === false) {
          return null;
        }

        return ReactActual.createElement('div', domProps, children ?? null);
      },
      Body: createWrapper(),
      CloseTrigger: Button,
      Container: createWrapper(),
      Dialog(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;
        const domProps = sanitizeDomProps(restProps);

        return ReactActual.createElement('div', { role: 'dialog', ...domProps }, children ?? null);
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
      const domProps = sanitizeDomProps(restProps);

      return ReactActual.createElement('div', { role: 'status', ...domProps }, children ?? null);
    },
    {
      CloseButton: Button,
      Description: createWrapper('span'),
      Provider(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;
        const domProps = sanitizeDomProps(restProps);
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
          { ...domProps, 'data-testid': 'hero-toast-provider' },
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
      const domProps = sanitizeDomProps(restProps);

      return ReactActual.createElement('input', {
        ...domProps,
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
        const { children, isDisabled, maxValue, minValue, onChange, step, value, ...restProps } = props;
        const domProps = sanitizeDomProps(restProps);

        return ReactActual.createElement(
          'div',
          { ...domProps, role: 'group' },
          ReactActual.createElement('input', {
            'aria-label': props['aria-label'],
            disabled: Boolean(isDisabled),
            max: typeof maxValue === 'number' ? maxValue : undefined,
            min: typeof minValue === 'number' ? minValue : undefined,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
              if (typeof onChange === 'function') {
                (onChange as (mockValue: number) => void)(Number(event.currentTarget.value));
              }
            },
            step: typeof step === 'number' ? step : undefined,
            type: 'range',
            value: String(Number(value ?? 0)),
          }),
          children ?? null,
        );
      },
      { Fill: createWrapper('span'), Thumb: createWrapper('span'), Track: createWrapper() },
    ),
    Switch: Object.assign(
      function SwitchRoot(props: MockHeroUiProps): React.JSX.Element {
        const { children, isSelected, onChange, ...restProps } = props;
        const domProps = sanitizeDomProps(restProps);

        return ReactActual.createElement(
          'label',
          domProps,
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
      {
        Control: createWrapper('span'),
        Thumb: createWrapper('span'),
        Content: createWrapper('span'),
        Icon: createWrapper('span'),
      },
    ),
    Table: Object.assign(createWrapper('table'), {
      Body: createWrapper('tbody'),
      Cell: createWrapper('td'),
      Column: createWrapper('th'),
      Content(props: MockHeroUiProps): React.JSX.Element {
        const { children, onRowAction } = props;

        return ReactActual.createElement(
          TableContext.Provider,
          {
            value: {
              onRowAction: typeof onRowAction === 'function' ? (onRowAction as (mockKey: string) => void) : undefined,
            },
          },
          children ?? null,
        );
      },
      Header(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;
        const domProps = sanitizeDomProps(restProps);

        return ReactActual.createElement('thead', domProps, ReactActual.createElement('tr', null, children ?? null));
      },
      Row(props: MockHeroUiProps): React.JSX.Element {
        const tableContext = ReactActual.useContext(TableContext);
        const { children, onPress, ...restProps } = props;
        const domProps = sanitizeDomProps(restProps);

        return ReactActual.createElement(
          'tr',
          {
            ...domProps,
            onClick: () => {
              if (typeof onPress === 'function') {
                onPress();

                return;
              }

              const rowId = props['id'];

              if (typeof rowId === 'number' || typeof rowId === 'string') {
                tableContext.onRowAction?.(String(rowId));
              }
            },
          },
          children ?? null,
        );
      },
    }),
    Tabs,
    Toast: ToastComponent,
    Toolbar(props: MockHeroUiProps): React.JSX.Element {
      const { children, isAttached: _isAttached, ...restProps } = props;
      const domProps = sanitizeDomProps(restProps);

      return ReactActual.createElement('div', { role: 'toolbar', ...domProps }, children ?? null);
    },
    Tooltip,
    toast: toastApi,
  };
});

vi.mock('@broadset/renderer', () => ({
  buildElementTransform: vi.fn(() => ''),
  createScreenRenderer: vi.fn(),
}));

vi.mock('@broadset/playback', () => ({
  applyGradientPropertyUpdates: vi.fn((gradient: unknown) => gradient),
  applyTimelineFrameToDom: vi.fn(
    (options: {
      readonly config?: { readonly targets?: Readonly<Record<string, unknown>> };
      readonly frame?: {
        readonly properties?: Readonly<Record<string, unknown>>;
        readonly targetProperties?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      };
      readonly resolver?: {
        readonly applyStyles?: (element: HTMLElement, styles: Readonly<Record<string, unknown>>) => void;
      };
      readonly root?: HTMLElement;
    }) => {
      if (options.root === undefined || options.resolver?.applyStyles === undefined) {
        return;
      }

      options.resolver.applyStyles(options.root, options.frame?.properties ?? {});

      for (const [targetId, properties] of Object.entries(options.frame?.targetProperties ?? {})) {
        const target = options.root.querySelector<HTMLElement>(`[data-animation-target-id="${targetId}"]`);

        if (target !== null) {
          options.resolver.applyStyles(target, properties);
        }
      }
    },
  ),
  computeTimelineFrame: vi.fn(
    (options: { readonly timeline: { readonly id: string; readonly name: string }; readonly timeMs: number }) => ({
      activeState: null,
      childFrames: {},
      durationMs: 0,
      modifiers: new Set(),
      properties: { opacity: 0.5 },
      targetProperties: {},
      timelineId: options.timeline.id,
      timelineName: options.timeline.name,
      timeMs: options.timeMs,
    }),
  ),
  computeTimelineLoopDuration: vi.fn().mockReturnValue(0),
  createPlaybackController: vi.fn(),
  escapeCssIdentifier: vi.fn((identifier: string) => identifier),
  isGradientAnimationTarget: vi.fn(() => false),
  parseGradientTarget: vi.fn(() => null),
  resolveAnimationTargets: vi.fn(() => ({
    applyStyles: vi.fn((element: HTMLElement, styles: Readonly<Record<string, unknown>>) => {
      for (const [property, value] of Object.entries(styles)) {
        element.style.setProperty(property, String(value));
      }
    }),
    clear: vi.fn(),
    clearStyles: vi.fn((element: HTMLElement, properties: readonly string[]) => {
      for (const property of properties) {
        element.style.removeProperty(property);
      }
    }),
    invalidate: vi.fn(),
  })),
  syncStateClasses: vi.fn(),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  window.localStorage.clear();

  const heroui = (await vi.importMock('@heroui/react')) as {
    readonly toast?: { readonly clear: () => void };
  };

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
