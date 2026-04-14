/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import type * as React from 'react';

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

jest.mock(
  '@heroui/react',
  () => {
    const ReactActual = jest.requireActual<typeof React>('react');
    const TabsContext = ReactActual.createContext<{
      readonly selectedKey: string;
      readonly onSelectionChange?: ((key: string | number | null) => void) | undefined;
    }>({ selectedKey: '', onSelectionChange: undefined });

    function createWrapper(tagName = 'div') {
      return function Wrapper(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;

        return ReactActual.createElement(tagName, restProps, children ?? null);
      };
    }

    function Button(props: MockHeroUiProps): React.JSX.Element {
      const { children, isDisabled, isIconOnly: _isIconOnly, onPress, ...restProps } = props;

      return ReactActual.createElement(
        'button',
        { ...restProps, disabled: isDisabled, onClick: typeof onPress === 'function' ? onPress : undefined },
        children ?? null,
      );
    }

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

    const Tooltip = Object.assign(createWrapper(), {
      Trigger: createWrapper(),
      Content: createWrapper('span'),
    });

    return {
      Button,
      Chip: createWrapper('span'),
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

            function mockPropagateMenuProps(node: React.ReactNode): React.ReactNode {
              return ReactActual.Children.map(node, (child) => {
                if (!ReactActual.isValidElement(child)) {
                  return child;
                }

                const childEl = child as React.ReactElement<Record<string, unknown>>;

                if (childEl.type === ReactActual.Fragment) {
                  return ReactActual.createElement(
                    ReactActual.Fragment,
                    null,
                    mockPropagateMenuProps(childEl.props['children'] as React.ReactNode),
                  );
                }

                return ReactActual.cloneElement(childEl, {
                  __onAction: onAction,
                  __disabledKeys: disabledKeys,
                });
              });
            }

            return ReactActual.createElement(
              'div',
              {
                'data-testid': 'dropdown-menu',
                role: 'menu',
                'data-disabled-keys': Array.isArray(disabledKeys) ? disabledKeys.join(',') : '',
                ...restProps,
              },
              mockPropagateMenuProps(children),
            );
          },
          Item(props: MockHeroUiProps): React.JSX.Element {
            const { children, id, textValue: _textValue, variant, __onAction, __disabledKeys, ...restProps } = props;
            const dKeys = Array.isArray(__disabledKeys) ? (__disabledKeys as readonly string[]) : [];
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
                  if (!isDisabled && __onAction !== undefined) {
                    __onAction(id as string | number);
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
      Kbd(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;

        return ReactActual.createElement('kbd', restProps, children ?? null);
      },
      Label(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;

        return ReactActual.createElement('span', { 'data-testid': 'label', ...restProps }, children ?? null);
      },
      Separator(props: MockHeroUiProps): React.JSX.Element {
        return ReactActual.createElement('hr', { role: 'separator', ...props });
      },
      Tabs,
      Toolbar(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;

        return ReactActual.createElement('div', { role: 'toolbar', ...restProps }, children ?? null);
      },
      Tooltip,
    };
  },
  { virtual: true },
);

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
    onCut: jest.fn<() => void>(),
    onCopy: jest.fn<() => void>(),
    onPaste: jest.fn<() => void>(),
    onDuplicate: jest.fn<() => void>(),
    onDelete: jest.fn<() => void>(),
    onBringToFront: jest.fn<() => void>(),
    onBringForward: jest.fn<() => void>(),
    onSendBackward: jest.fn<() => void>(),
    onSendToBack: jest.fn<() => void>(),
    onGroup: jest.fn<() => void>(),
    onUngroup: jest.fn<() => void>(),
    onToggleLock: jest.fn<() => void>(),
    onEditClipPath: jest.fn<() => void>(),
    onEditPathPoints: jest.fn<() => void>(),
    onClose: jest.fn<() => void>(),
    ...overrides,
  };
}
