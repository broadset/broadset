/** @jest-environment jsdom */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import type { CanvasContextMenuProps } from './toolbar-nav';
import { CanvasContextMenu, DEFAULT_ELEMENT_TYPES, EditorToolbar, ElementLibrary, PageSorter } from './toolbar-nav';

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
          const { children, isOpen, onOpenChange, ...restProps } = props;

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
            const { children, id, textValue, variant, __onAction, __disabledKeys, ...restProps } = props;
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

describe('EditorToolbar', () => {
  /** @description The main toolbar must expose undo/redo and view toggles with proper disabled states so the editor shell behaves like a real design tool. */
  it('renders a HeroUI toolbar and wires actions for undo, redo, save, and toggles', () => {
    const onUndo = jest.fn<() => void>();
    const onRedo = jest.fn<() => void>();
    const onSave = jest.fn<() => void>();
    const onToggleGrid = jest.fn<() => void>();
    const onToggleGuides = jest.fn<() => void>();

    render(
      <EditorToolbar
        canUndo={false}
        canRedo
        showGrid
        showGuides={false}
        zoomPercent={125}
        onUndo={onUndo}
        onRedo={onRedo}
        onSave={onSave}
        onToggleGrid={onToggleGrid}
        onToggleGuides={onToggleGuides}
      />,
    );

    const toolbar = screen.getByRole('toolbar', { name: /editor toolbar/i });
    const undoButton = screen.getByRole('button', { name: /undo/i });
    const redoButton = screen.getByRole('button', { name: /redo/i });
    const saveButton = screen.getByRole('button', { name: /save/i });
    const gridButton = screen.getByRole('button', { name: /toggle grid/i });
    const guidesButton = screen.getByRole('button', { name: /toggle guides/i });

    expect(toolbar).not.toBeNull();
    expect(undoButton.hasAttribute('disabled')).toBe(true);
    expect(redoButton.hasAttribute('disabled')).toBe(false);
    expect(screen.getByText('125%').textContent).toBe('125%');
    expect(saveButton.textContent.trim()).toBe('');
    expect(gridButton.textContent.trim()).toBe('');
    expect(guidesButton.textContent.trim()).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /redo/i }));
    fireEvent.click(saveButton);
    fireEvent.click(gridButton);
    fireEvent.click(guidesButton);

    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onToggleGrid).toHaveBeenCalledTimes(1);
    expect(onToggleGuides).toHaveBeenCalledTimes(1);
  });

  /** @description The optional Save command must disappear when no host save handler is configured so the UI never advertises a dead action. */
  it('hides the save button when onSave is not configured', () => {
    render(
      <EditorToolbar
        canUndo={false}
        canRedo={false}
        showGrid={false}
        showGuides={false}
        zoomPercent={100}
        onUndo={() => undefined}
        onRedo={() => undefined}
        onToggleGrid={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});

describe('ElementLibrary', () => {
  /** @description The element library must render all built-in tiles plus any custom plugin tiles in a two-column grid and start placement on click. */
  it('renders built-in and custom element tiles and forwards selection', () => {
    const onSelect = jest.fn<(type: string) => void>();

    render(
      <ElementLibrary
        elementTypes={[...DEFAULT_ELEMENT_TYPES, { type: 'countdown', label: 'Countdown' }]}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId('element-library-grid').getAttribute('data-columns')).toBe('2');
    expect(screen.getByRole('button', { name: /text/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /rectangle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /countdown/i })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /countdown/i }));
    expect(onSelect).toHaveBeenCalledWith('countdown');
  });
});

describe('PageSorter', () => {
  /** @description Scene tabs must mirror the document pages, allow switching, and expose add/remove controls while protecting single-scene documents. */
  it('lists scenes, highlights the active one, and wires add/remove actions', () => {
    const onPageSelect = jest.fn<(index: number) => void>();
    const onPageAdd = jest.fn<() => void>();
    const onPageRemove = jest.fn<(index: number) => void>();

    render(
      <PageSorter
        pages={[
          { id: 'page-1', name: 'Intro' },
          { id: 'page-2', name: 'Offer' },
          { id: 'page-3', name: 'Outro' },
        ]}
        activePageIndex={1}
        onPageSelect={onPageSelect}
        onPageAdd={onPageAdd}
        onPageRemove={onPageRemove}
      />,
    );

    const activeTab = screen.getByRole('tab', { name: /scene 2/i });

    expect(activeTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: /scene 3/i }));
    fireEvent.click(screen.getByRole('button', { name: /add scene/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove scene/i }));

    expect(onPageSelect).toHaveBeenCalledWith(2);
    expect(onPageAdd).toHaveBeenCalledTimes(1);
    expect(onPageRemove).toHaveBeenCalledWith(1);
  });

  /** @description Removing the only scene must be hidden so the editor always preserves the required one-scene minimum. */
  it('hides the remove action for single-scene documents', () => {
    render(
      <PageSorter
        pages={[{ id: 'page-1', name: 'Only scene' }]}
        activePageIndex={0}
        onPageSelect={() => undefined}
        onPageAdd={() => undefined}
        onPageRemove={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /remove scene/i })).toBeNull();
  });
});

function defaultContextMenuProps(overrides: Partial<CanvasContextMenuProps> = {}): CanvasContextMenuProps {
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

describe('CanvasContextMenu', () => {
  /** @description The context menu must appear positioned at click coordinates. */
  it('renders at the specified position', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    const menu = screen.getByRole('menu');

    expect(menu).not.toBeNull();
  });

  /** @description When isOpen is false, the context menu must not render. */
  it('does not render when isOpen is false', () => {
    const props = defaultContextMenuProps({ isOpen: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  /** @description When no element is selected, editing items are not rendered (only Paste shown). */
  it('does not render editing items when no selection exists', () => {
    const props = defaultContextMenuProps({ hasSelection: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.queryByTestId('menu-item-cut')).toBeNull();
    expect(screen.queryByTestId('menu-item-copy')).toBeNull();
    expect(screen.queryByTestId('menu-item-duplicate')).toBeNull();
    expect(screen.queryByTestId('menu-item-delete')).toBeNull();
  });

  /** @description When right-clicking on empty canvas without selection, only Paste is shown. */
  it('shows only Paste when nothing is selected', () => {
    const props = defaultContextMenuProps({ hasSelection: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-paste')).not.toBeNull();
    expect(screen.queryByTestId('menu-item-cut')).toBeNull();
    expect(screen.queryByTestId('menu-item-copy')).toBeNull();
    expect(screen.queryByTestId('menu-item-duplicate')).toBeNull();
    expect(screen.queryByTestId('menu-item-delete')).toBeNull();
    expect(screen.queryByTestId('menu-item-bring-to-front')).toBeNull();
    expect(screen.queryByTestId('menu-item-toggle-lock')).toBeNull();
  });

  /** @description When Cut is clicked, the onCut callback must fire. */
  it('calls onCut when Cut is clicked', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-cut'));

    expect(props.onCut).toHaveBeenCalledTimes(1);
  });

  /** @description When Copy is clicked and then Paste, the respective callbacks must fire. */
  it('calls onCopy and onPaste when clicked', () => {
    const props = defaultContextMenuProps({ hasClipboard: true });

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-copy'));
    fireEvent.click(screen.getByTestId('menu-item-paste'));

    expect(props.onCopy).toHaveBeenCalledTimes(1);
    expect(props.onPaste).toHaveBeenCalledTimes(1);
  });

  /** @description When delete is clicked, removeElements must be called for all selected. */
  it('calls onDelete when Delete is clicked', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-delete'));

    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  /** @description When a locked element is selected, Cut, Duplicate, and Delete must be disabled. */
  it('disables Cut, Duplicate, Delete for locked elements', () => {
    const props = defaultContextMenuProps({ isLocked: true });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-cut').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('menu-item-duplicate').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('menu-item-delete').getAttribute('aria-disabled')).toBe('true');
  });

  /** @description Group/Ungroup must be visible when 2+ elements are selected. */
  it('shows Group and Ungroup when multi-selecting', () => {
    const props = defaultContextMenuProps({ isMultiSelect: true, isGroupSelected: true });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-group')).not.toBeNull();
    expect(screen.getByTestId('menu-item-ungroup')).not.toBeNull();
    expect(screen.getByTestId('menu-item-ungroup').getAttribute('aria-disabled')).toBe('false');
  });

  /** @description Ungroup must be disabled when multi-selecting non-group elements. */
  it('disables Ungroup when no group is selected', () => {
    const props = defaultContextMenuProps({ isMultiSelect: true, isGroupSelected: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-group')).not.toBeNull();
    expect(screen.getByTestId('menu-item-ungroup').getAttribute('aria-disabled')).toBe('true');
  });

  /** @description Group/Ungroup must be absent when a single element is selected. */
  it('hides Group and Ungroup for single selection', () => {
    const props = defaultContextMenuProps({ isMultiSelect: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.queryByTestId('menu-item-group')).toBeNull();
    expect(screen.queryByTestId('menu-item-ungroup')).toBeNull();
  });

  /** @description Layer reorder actions call the correct callbacks. */
  it('calls reorder callbacks for layer operations', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-bring-to-front'));
    fireEvent.click(screen.getByTestId('menu-item-bring-forward'));
    fireEvent.click(screen.getByTestId('menu-item-send-backward'));
    fireEvent.click(screen.getByTestId('menu-item-send-to-back'));

    expect(props.onBringToFront).toHaveBeenCalledTimes(1);
    expect(props.onBringForward).toHaveBeenCalledTimes(1);
    expect(props.onSendBackward).toHaveBeenCalledTimes(1);
    expect(props.onSendToBack).toHaveBeenCalledTimes(1);
  });

  /** @description Lock/Unlock toggles the element's locked state and shows the correct label. */
  it('shows Lock label for unlocked element and fires onToggleLock', () => {
    const props = defaultContextMenuProps({ isLocked: false });

    render(<CanvasContextMenu {...props} />);

    const lockItem = screen.getByTestId('menu-item-toggle-lock');

    expect(lockItem.textContent).toContain('Lock');
    fireEvent.click(lockItem);

    expect(props.onToggleLock).toHaveBeenCalledTimes(1);
  });

  /** @description Lock/Unlock must show Unlock when element is already locked. */
  it('shows Unlock label for locked element', () => {
    const props = defaultContextMenuProps({ isLocked: true });

    render(<CanvasContextMenu {...props} />);

    const lockItem = screen.getByTestId('menu-item-toggle-lock');

    expect(lockItem.textContent).toContain('Unlock');
  });

  /** @description Edit Path Points must be visible only for path elements. */
  it('shows Edit Path Points for path elements', () => {
    const props = defaultContextMenuProps({ isPathElement: true });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-edit-path')).not.toBeNull();
  });

  /** @description Edit Path Points must be hidden for non-path elements. */
  it('hides Edit Path Points for non-path elements', () => {
    const props = defaultContextMenuProps({ isPathElement: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.queryByTestId('menu-item-edit-path')).toBeNull();
  });

  /** @description Edit Path Points callback fires when clicked. */
  it('calls onEditPathPoints when Edit Path Points is clicked', () => {
    const props = defaultContextMenuProps({ isPathElement: true });

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-edit-path'));

    expect(props.onEditPathPoints).toHaveBeenCalledTimes(1);
  });

  /** @description Edit Clip Path must be visible only for elements with clipPath capability. */
  it('shows Edit Clip Path for elements with clipPath capability', () => {
    const props = defaultContextMenuProps({ hasClipPathCapability: true });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-edit-clip-path')).not.toBeNull();
  });

  /** @description Edit Clip Path callback fires when clicked. */
  it('calls onEditClipPath when Edit Clip Path is clicked', () => {
    const props = defaultContextMenuProps({ hasClipPathCapability: true });

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-edit-clip-path'));

    expect(props.onEditClipPath).toHaveBeenCalledTimes(1);
  });

  /** @description Delete item must render with danger variant (red text). */
  it('renders Delete with danger variant', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-delete').getAttribute('data-variant')).toBe('danger');
  });

  /** @description Paste must be disabled when clipboard is empty. */
  it('disables Paste when clipboard is empty', () => {
    const props = defaultContextMenuProps({ hasClipboard: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-paste').getAttribute('aria-disabled')).toBe('true');
  });
});
