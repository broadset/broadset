/** @jest-environment jsdom */

import { createPlaybackController } from '@broadset/playback';
import { createScreenRenderer } from '@broadset/renderer';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    return {
      Accordion,
      Button,
      Card: createWrapper(),
      CardContent: createWrapper(),
      CardDescription: createWrapper('p'),
      CardHeader: createWrapper(),
      CardTitle: createWrapper('h2'),
      Chip: createWrapper('span'),
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
      NumberField,
      Select,
      Separator: createWrapper('hr'),
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

jest.mock('@broadset/renderer', () => ({
  createScreenRenderer: jest.fn(),
}));

jest.mock('@broadset/playback', () => ({
  createPlaybackController: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();

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
   * @description Verifies the host save callback persists the current document and restores saved work on the next load.
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
