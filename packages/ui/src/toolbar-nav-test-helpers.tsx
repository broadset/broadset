/** @vitest-environment jsdom */

import type * as React from 'react';
import { vi } from 'vitest';

import type { CanvasContextMenuProps } from './toolbar-nav';

interface MockHeroUiProps {
  readonly children?: React.ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly label?: string | undefined;
  readonly ['aria-label']?: string | undefined;
  readonly value?: string | number | readonly string[] | undefined;
  readonly selectedKey?: string | number | null | undefined;
  readonly onSelectionChange?: ((mockId: string | number | null) => void) | undefined;
  readonly onChange?: ((event: React.ChangeEvent<HTMLInputElement>) => void) | undefined;
  readonly __onAction?: ((mockId: string | number) => void) | undefined;
  readonly [mockKey: string]: unknown;
}

vi.mock('@heroui/react', async () => {
  const ReactActual = await vi.importActual<typeof React>('react');
  const { buildCommonHeroUi } = await import('./testing/heroui-mock-common');
  const common = buildCommonHeroUi(ReactActual);
  const TabsContext = ReactActual.createContext<{
    readonly selectedKey: string;
    readonly onSelectionChange?: ((key: string | number | null) => void) | undefined;
  }>({ selectedKey: '', onSelectionChange: undefined });
  const DropdownMenuContext = ReactActual.createContext<{
    readonly disabledKeys: readonly string[];
    readonly onAction?: ((mockId: string | number) => void) | undefined;
  }>({ disabledKeys: [], onAction: undefined });

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
      List(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;

        return ReactActual.createElement('div', { ...restProps, role: 'tablist' }, children ?? null);
      },
      Tab(props: MockHeroUiProps): React.JSX.Element {
        const { children, id, ...restProps } = props;
        const context = ReactActual.useContext(TabsContext);
        const tabId = typeof id === 'string' || typeof id === 'number' ? String(id) : '';

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

  const Tooltip = Object.assign(common.createWrapper(), {
    Trigger: common.createWrapper(),
    Content: common.createWrapper('span'),
  });

  return {
    Button: common.Button,
    Chip: common.Chip,
    Dropdown: Object.assign(
      function DropdownRoot(props: MockHeroUiProps): React.JSX.Element {
        const { children, isOpen, onOpenChange: _onOpenChange, ...restProps } = props;

        if (isOpen !== true) {
          return ReactActual.createElement('div', { 'data-testid': 'dropdown-root', ...restProps });
        }

        return ReactActual.createElement('div', { 'data-testid': 'dropdown-root', ...restProps }, children ?? null);
      },
      {
        Trigger(props: MockHeroUiProps): React.JSX.Element {
          const { children, ...restProps } = props;

          return ReactActual.createElement(
            'div',
            { 'data-testid': 'dropdown-trigger', ...restProps },
            children ?? null,
          );
        },
        Popover(props: MockHeroUiProps): React.JSX.Element {
          const { children, ...restProps } = props;

          return ReactActual.createElement(
            'div',
            { 'data-testid': 'dropdown-popover', ...restProps },
            children ?? null,
          );
        },
        Menu(props: MockHeroUiProps): React.JSX.Element {
          const { children, disabledKeys, onAction, ...restProps } = props;

          return ReactActual.createElement(
            DropdownMenuContext.Provider,
            {
              value: {
                disabledKeys: Array.isArray(disabledKeys) ? disabledKeys.map((key) => String(key)) : [],
                onAction: typeof onAction === 'function' ? (onAction as (mockId: string | number) => void) : undefined,
              },
            },
            ReactActual.createElement(
              'div',
              {
                'data-testid': 'dropdown-menu',
                role: 'menu',
                'data-disabled-keys': Array.isArray(disabledKeys) ? disabledKeys.join(',') : '',
                ...restProps,
              },
              children ?? null,
            ),
          );
        },
        Item(props: MockHeroUiProps): React.JSX.Element {
          const { children, id, textValue: _textValue, variant, ...restProps } = props;
          const menuContext = ReactActual.useContext(DropdownMenuContext);
          const dKeys = menuContext.disabledKeys;
          const itemId = typeof id === 'string' || typeof id === 'number' ? String(id) : '';
          const isDisabled = itemId !== '' && dKeys.includes(itemId);

          return ReactActual.createElement(
            'div',
            {
              role: 'menuitem',
              'data-testid': `menu-item-${itemId}`,
              'data-variant': variant ?? 'default',
              'aria-disabled': isDisabled ? 'true' : 'false',
              onClick: () => {
                if (!isDisabled && menuContext.onAction !== undefined) {
                  menuContext.onAction(id as string | number);
                }
              },
              ...restProps,
            },
            children ?? null,
          );
        },
        Section(props: MockHeroUiProps): React.JSX.Element {
          const { children, ...restProps } = props;

          return ReactActual.createElement(
            'div',
            { 'data-testid': 'dropdown-section', ...restProps },
            children ?? null,
          );
        },
      },
    ),
    Kbd: common.Kbd,
    Label(props: MockHeroUiProps): React.JSX.Element {
      const { children, ...restProps } = props;

      return ReactActual.createElement('span', { 'data-testid': 'label', ...restProps }, children ?? null);
    },
    Separator: common.Separator,
    Tabs,
    Toolbar: common.Toolbar,
    Tooltip,
  };
});

export function defaultContextMenuProps(overrides: Partial<CanvasContextMenuProps> = {}): CanvasContextMenuProps {
  return {
    isOpen: true,
    position: { x: 200, y: 150 },
    hasSelection: true,
    isLocked: false,
    isRequired: false,
    isMultiSelect: false,
    isGroupSelected: false,
    isPathElement: false,
    hasClipPathCapability: false,
    hasClipboard: false,
    onCut: vi.fn<() => void>(),
    onCopy: vi.fn<() => void>(),
    onPaste: vi.fn<() => void>(),
    onDuplicate: vi.fn<() => void>(),
    onDelete: vi.fn<() => void>(),
    onBringToFront: vi.fn<() => void>(),
    onBringForward: vi.fn<() => void>(),
    onSendBackward: vi.fn<() => void>(),
    onSendToBack: vi.fn<() => void>(),
    onGroup: vi.fn<() => void>(),
    onUngroup: vi.fn<() => void>(),
    onToggleLock: vi.fn<() => void>(),
    onEditClipPath: vi.fn<() => void>(),
    onEditPathPoints: vi.fn<() => void>(),
    onClose: vi.fn<() => void>(),
    ...overrides,
  };
}
