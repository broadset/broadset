/** @jest-environment jsdom */

import { createPlaybackController } from '@broadset/playback';
import { createScreenRenderer } from '@broadset/renderer';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';

import { DemoApp } from './DemoApp';
import { SAMPLE_DOCUMENT } from './sampleDocument';

interface MockHeroUiProps {
  readonly children?: React.ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly startContent?: React.ReactNode;
  readonly isDisabled?: boolean | undefined;
  readonly value?: string | number | readonly string[] | undefined;
  readonly selectedKey?: string | number | null | undefined;
  readonly onSelectionChange?: ((key: string | number | null) => void) | undefined;
  readonly onAction?: (() => void) | undefined;
  readonly onChange?: ((event: React.ChangeEvent<HTMLInputElement>) => void) | ((value: number) => void) | undefined;
  readonly [key: string]: unknown;
}

jest.mock(
  '@heroui/react',
  () => {
    const ReactActual = jest.requireActual<typeof React>('react');
    const TabsContext = ReactActual.createContext<{
      readonly selectedKey: string;
      readonly onSelectionChange?: ((key: string | number | null) => void) | undefined;
    }>({ onSelectionChange: undefined, selectedKey: '' });
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

    const Accordion = Object.assign(createWrapper(), {
      Item: createWrapper(),
      Heading: createWrapper(),
      Trigger: Button,
      Panel: createWrapper(),
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
      },
    );

    const Tooltip = Object.assign(createWrapper(), {
      Trigger: createWrapper(),
      Content: createWrapper('span'),
    });

    const Dropdown = Object.assign(createWrapper(), {
      Trigger: createWrapper(),
      Popover: createWrapper(),
      Menu(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;

        return ReactActual.createElement('div', { role: 'menu', ...restProps }, children ?? null);
      },
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
    });

    const Select = Object.assign(createWrapper(), {
      Trigger: createWrapper(),
      Value: createWrapper('span'),
      Popover: createWrapper(),
    });

    const Kbd = Object.assign(createWrapper('kbd'), {
      Abbr: createWrapper('abbr'),
      Content: createWrapper('span'),
    });

    const Modal = Object.assign(
      function ModalRoot(props: MockHeroUiProps): React.JSX.Element | null {
        const { children, ...restProps } = props;

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
        Container: createWrapper(),
        Dialog(props: MockHeroUiProps): React.JSX.Element {
          const { children, ...restProps } = props;

          return ReactActual.createElement('div', { role: 'dialog', ...restProps }, children ?? null);
        },
        Header: createWrapper(),
        Heading: createWrapper('h2'),
        Body: createWrapper(),
        Footer: createWrapper(),
        CloseTrigger: Button,
      },
    );

    const toastSubscribers = new Set<() => void>();
    let toastEntries: Array<{ id: string; readonly description?: React.ReactNode; readonly message: React.ReactNode }> =
      [];

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
        Description: createWrapper('span'),
        CloseButton: Button,
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
      Dropdown,
      Input(props: MockHeroUiProps): React.JSX.Element {
        const { onChange, value = '', ...restProps } = props;

        return ReactActual.createElement('input', {
          ...restProps,
          onChange: typeof onChange === 'function' ? onChange : undefined,
          value,
        });
      },
      ListBox: createWrapper(),
      ListBoxItem: createWrapper(),
      Kbd,
      Modal,
      NumberField,
      ScrollShadow: createWrapper(),
      Select,
      Separator: createWrapper('hr'),
      Tabs,
      Toast: ToastComponent,
      toast: toastApi,
      Toolbar(props: MockHeroUiProps): React.JSX.Element {
        const { children, isAttached: _isAttached, ...restProps } = props;

        return ReactActual.createElement('div', { role: 'toolbar', ...restProps }, children ?? null);
      },
      Tooltip,
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

/**
 * @description Verifies the demo shell keeps its renderer and playback controller stable across rerenders.
 */
describe('DemoApp playback shell lifecycle', () => {
  /**
   * @description Guards against rebuilding the animated preview controller when the demo shell rerenders.
   */
  it('does not recreate the renderer or playback controller when the shell rerenders with the same document', () => {
    const rendererDestroy = jest.fn();
    const updateDocument = jest.fn();
    const playbackDestroy = jest.fn();
    const attach = jest.fn();
    const pause = jest.fn();
    const play = jest.fn();
    const seek = jest.fn();
    const setRegistry = jest.fn();
    const setSpeed = jest.fn();
    const seekTimeline = jest.fn();
    const stopTimeline = jest.fn();
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument,
      destroy: rendererDestroy,
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach,
      detach: jest.fn(),
      play,
      pause,
      seek,
      setSpeed,
      setRegistry,
      seekTimeline,
      stopTimeline,
      destroy: playbackDestroy,
    });

    const { rerender, unmount } = render(<DemoApp />);

    expect(mockedCreateScreenRenderer).toHaveBeenCalledTimes(1);
    expect(mockedCreatePlaybackController).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(0);

    rerender(<DemoApp />);

    expect(mockedCreateScreenRenderer).toHaveBeenCalledTimes(1);
    expect(mockedCreatePlaybackController).toHaveBeenCalledTimes(1);
    expect(rendererDestroy).not.toHaveBeenCalled();
    expect(playbackDestroy).not.toHaveBeenCalled();

    unmount();

    expect(rendererDestroy).toHaveBeenCalledTimes(1);
    expect(playbackDestroy).toHaveBeenCalledTimes(1);
  });

  /**
   * @description Proves the play, pause, and reset controls dispatch the expected playback API calls.
   */
  it('wires the play/pause toggle and reset controls to the playback controller', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);
    const play = jest.fn();
    const pause = jest.fn();
    const seek = jest.fn();

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play,
      pause,
      seek,
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    fireEvent.click(screen.getByTestId('demo-playback-toggle'));
    expect(play).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('demo-playback-toggle'));
    expect(pause).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('demo-playback-reset'));
    expect(seek).toHaveBeenLastCalledWith(0);
  });

  /**
   * @description Ensures the shell enforces the dark viewport contract and restores the host page state on unmount.
   */
  it('applies the dark theme and viewport overflow lock while mounted and restores previous values on unmount', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    const rootElement = document.getElementById('root');
    const { unmount } = render(<DemoApp />);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(rootElement?.style.overflow).toBe('hidden');

    unmount();

    expect(document.documentElement.style.overflow).toBe('visible');
    expect(document.body.style.overflow).toBe('visible');
    expect(rootElement?.style.overflow).toBe('visible');
  });

  /**
   * @description Verifies the host save callback persists the current document, restores saved work on the next load, and exposes action feedback through a HeroUI toast live region.
   */
  it('restores a saved document from localStorage and saves the current document through the File menu', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);
    const savedDocument = { ...SAMPLE_DOCUMENT, name: 'Recovered demo layout' };

    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(savedDocument));
    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    expect(screen.getByText('Recovered demo layout')).toBeTruthy();

    const [saveButton] = screen.getAllByRole('button', { name: /^save$/i });

    expect(saveButton).toBeDefined();

    if (saveButton === undefined) {
      throw new Error('Expected the demo shell to render a Save action.');
    }

    fireEvent.click(saveButton);

    expect(window.localStorage.getItem('broadset:demo-document:v1')).toContain('Recovered demo layout');
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText(/saved the demo document locally/i)).toBeTruthy();
  });

  /**
   * @description Prevents the floating menu bar from nesting HeroUI trigger buttons inside other buttons, which breaks layout and accessibility in the real browser.
   */
  it('renders dropdown triggers without nested buttons in the floating toolbar', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    const toolbar = screen.getByTestId('demo-main-toolbar');

    expect(toolbar.querySelector('button button')).toBeNull();
  });

  /**
   * @description Prevents the shell from regressing back to oversized custom chrome by requiring HeroUI toolbar primitives, a square workarea, and a sidebar drawer that stays clear of the top-right toolbar.
   */
  it('uses compact toolbars and keeps the canvas workarea square beneath the floating sidebar', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    expect(screen.getAllByRole('toolbar').length).toBeGreaterThanOrEqual(3);

    const mainToolbar = screen.getByRole('toolbar', { name: /main editor toolbar/i });
    const workarea = screen.getByTestId('demo-canvas-workarea');
    const shellSection = workarea.closest('section');
    const sidebar = screen.getByTestId('demo-properties-sidebar');
    const toolbarStyle = mainToolbar.getAttribute('style') ?? '';
    const toolbarShell = screen.getByTestId('demo-main-toolbar').querySelector('.card');
    const elementShell = screen.getByTestId('demo-element-library').querySelector('.card');
    const sidebarShell = screen.getByRole('toolbar', { name: /sidebar toolbar/i }).closest('.card');
    const sidebarStyle = sidebar.getAttribute('style') ?? '';

    expect(workarea.className).not.toContain('rounded');
    expect(shellSection?.style.paddingRight).not.toBe('332px');
    expect(sidebarStyle).toContain('right: 0px');
    expect(sidebarStyle).toContain('top: 72px');
    expect(sidebarStyle).toContain('border-top-right-radius: 0');
    expect(sidebarStyle).toContain('border-bottom-right-radius: 0');
    expect(toolbarStyle).not.toContain('justify-content: space-between');
    expect(toolbarStyle).not.toContain('width: 100%');
    expect(toolbarShell).toBeNull();
    expect(elementShell).toBeNull();
    expect(sidebarShell).toBeNull();
  });

  /**
   * @description Keeps navigation first-class by exposing direct zoom controls in the visible toolbar rather than hiding all zoom actions inside menus.
   */
  it('shows direct zoom controls and updates the zoom level from the toolbar', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    const zoomLevel = screen.getByLabelText(/zoom level/i);

    expect(zoomLevel.textContent).toBe('100%');

    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(zoomLevel.textContent).toBe('110%');

    fireEvent.click(screen.getByRole('button', { name: /zoom out/i }));
    expect(zoomLevel.textContent).toBe('100%');
  });

  /**
   * @description Keeps tooltip callouts readable by pointing them inward toward the working canvas rather than outward off the screen edges.
   */
  it('places toolbar tooltips inward toward the canvas center', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    const mainToolbar = screen.getByRole('toolbar', { name: /main editor toolbar/i });
    const sidebarToolbar = screen.getByRole('toolbar', { name: /sidebar toolbar/i });
    const elementToolbar = screen.getByRole('toolbar', { name: /element toolbar/i });

    expect(
      within(mainToolbar).getByRole('button', { name: /undo/i }).closest('div[data-placement="bottom"]'),
    ).not.toBeNull();
    expect(
      within(elementToolbar)
        .getByRole('button', { name: /^text$/i })
        .closest('div[data-placement="right"]'),
    ).not.toBeNull();
    expect(
      within(sidebarToolbar)
        .getByRole('button', { name: /^layers$/i })
        .closest('div[data-placement="left"]'),
    ).not.toBeNull();
  });

  /**
   * @description Prevents the horizontal ruler scale from drifting when the right sidebar is resized, since the top ruler must stay independent of sidebar width.
   */
  it('keeps the top ruler tick positions stable regardless of saved sidebar width', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    window.localStorage.setItem(
      'broadset:demo-sidebar-preferences:v1',
      JSON.stringify({ isOpen: true, tab: 'properties', width: 256 }),
    );

    const { unmount } = render(<DemoApp />);
    const narrowTickLeft = screen.getByText('1728').parentElement?.getAttribute('style') ?? '';

    unmount();

    window.localStorage.setItem(
      'broadset:demo-sidebar-preferences:v1',
      JSON.stringify({ isOpen: true, tab: 'properties', width: 800 }),
    );

    render(<DemoApp />);

    const wideTickLeft = screen.getByText('1728').parentElement?.getAttribute('style') ?? '';

    expect(wideTickLeft).toBe(narrowTickLeft);
  });

  /**
   * @description Locks the Phase 4 menu-bar contract so the File and View menus expose the required editor actions instead of a trimmed subset.
   */
  it('renders the phase 4 file and view menu actions defined by the spec', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    expect(screen.getByRole('button', { name: /new document/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /save as json/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^import$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^export$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /document settings/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /debug snapshot/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /show rulers/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /show grid/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /hide rulers/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /hide grid/i })).toBeNull();
    expect(screen.getByRole('button', { name: /snap to grid/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /zoom to fit/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /reset zoom/i })).toBeTruthy();
  });

  /**
   * @description Preserves the Phase 4 custom plugin contract so the countdown tool appears alongside the built-in element types in the vertical toolbar.
   */
  it('renders the countdown plugin in the element toolbar', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    expect(screen.getByRole('button', { name: /countdown/i })).toBeTruthy();
  });

  /**
   * @description Ensures the Help menu opens actual modal dialogs instead of transient toasts so Phase 4 users can read shortcuts and About content without it disappearing.
   */
  it('opens help dialogs from the menu bar', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));
    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /about/i }));
    expect(screen.getByRole('dialog', { name: /about broadset demo/i })).toBeTruthy();
  });

  /**
   * @description Locks the Help dialog to HeroUI's keyboard-shortcut presentation so the shortcuts are shown as real keycaps rather than plain text sentences.
   */
  it('renders keyboard shortcuts using keycap elements in the shortcuts dialog', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));

    const shortcutsDialog = screen.getByRole('dialog', { name: /keyboard shortcuts/i });

    expect(shortcutsDialog.querySelectorAll('kbd').length).toBeGreaterThanOrEqual(8);
  });

  /**
   * @description Ensures empty-canvas right-click keeps the context menu minimal so users only see the paste affordance.
   */
  it('shows only the Paste action when the user right-clicks empty canvas', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);
    fireEvent.contextMenu(screen.getByLabelText(/screen preview for/i));

    expect(screen.getByRole('button', { name: /^paste\b/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^cut\b/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^copy\b/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^duplicate\b/i })).toBeNull();
  });

  /**
   * @description Ensures locked elements cannot be cut, duplicated, or deleted from the context menu.
   */
  it('disables destructive context-menu actions for locked elements', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);
    const lockedElementId = SAMPLE_DOCUMENT.elements[0].id;
    const lockedDocument = {
      ...SAMPLE_DOCUMENT,
      elements: SAMPLE_DOCUMENT.elements.map((element, index) =>
        index === 0 ? { ...element, locked: true } : element,
      ),
    };

    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(lockedDocument));
    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    const rendererHost = screen.getByTestId('screen-renderer-host');
    const lockedElementNode = document.createElement('div');

    lockedElementNode.dataset['elementId'] = lockedElementId;
    rendererHost.appendChild(lockedElementNode);
    fireEvent.contextMenu(lockedElementNode);

    expect(screen.getByRole('button', { name: /^cut\b/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /^duplicate\b/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /^delete\b/i }).hasAttribute('disabled')).toBe(true);
  });

  /**
   * @description Confirms the floating sidebar toolbar disables element-specific tabs when nothing is selected.
   */
  it('disables the Properties and Animation sidebar buttons after the selection is cleared', () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);
    fireEvent.click(screen.getByLabelText(/screen preview for/i));

    expect(screen.getByRole('button', { name: /properties/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /animation/i }).hasAttribute('disabled')).toBe(true);
  });

  /**
   * @description Proves the fullscreen control can enter and exit browser fullscreen and reflects the current state.
   */
  it('toggles fullscreen from the toolbar and updates the button label', async () => {
    const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
    const mockedCreatePlaybackController = jest.mocked(createPlaybackController);
    let fullscreenElement: Element | null = null;

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: jest.fn().mockImplementation(() => {
        fullscreenElement = document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));

        return Promise.resolve();
      }),
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: jest.fn().mockImplementation(() => {
        fullscreenElement = null;
        document.dispatchEvent(new Event('fullscreenchange'));

        return Promise.resolve();
      }),
    });

    mockedCreateScreenRenderer.mockReturnValue({
      host: document.createElement('div'),
      updateDocument: jest.fn(),
      destroy: jest.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      detach: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      setSpeed: jest.fn(),
      setRegistry: jest.fn(),
      seekTimeline: jest.fn(),
      stopTimeline: jest.fn(),
      destroy: jest.fn(),
    });

    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /enter fullscreen/i }));

    await waitFor(() => {
      expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /exit fullscreen/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /exit fullscreen/i }));

    await waitFor(() => {
      expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /enter fullscreen/i })).toBeTruthy();
    });
  });
});
