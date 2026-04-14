/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';
import { createDemoAppPlaybackTestDocument } from './test-fixtures';

describe('DemoApp playback shell lifecycle', () => {
  /** @description Guards against rebuilding the animated preview controller when the demo shell rerenders. */
  it('does not recreate the renderer or playback controller when the shell rerenders with the same document', () => {
    const rendererDestroy = jest.fn();
    const updateDocument = jest.fn();
    const playbackDestroy = jest.fn();
    const attach = jest.fn();
    const pause = jest.fn();
    const play = jest.fn();
    const seek = jest.fn();
    const setAnimations = jest.fn();
    const setSpeed = jest.fn();
    const seekTimeline = jest.fn();
    const stopTimeline = jest.fn();
    const { mockedCreatePlaybackController, mockedCreateScreenRenderer } = setupDemoShellMocks();

    mockedCreateScreenRenderer.mockReturnValue({
      destroy: rendererDestroy,
      host: document.createElement('div'),
      updateDocument,
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach,
      destroy: playbackDestroy,
      detach: jest.fn(),
      pause,
      play,
      seek,
      seekTimeline,
      setAnimations,
      setSpeed,
      stopTimeline,
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

  /** @description Proves the play, pause, and reset controls dispatch the expected playback API calls. */
  it('wires the play/pause toggle and reset controls to the playback controller', () => {
    const { mockedCreatePlaybackController } = setupDemoShellMocks();
    const play = jest.fn();
    const pause = jest.fn();
    const seek = jest.fn();

    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      destroy: jest.fn(),
      detach: jest.fn(),
      pause,
      play,
      seek,
      seekTimeline: jest.fn(),
      setAnimations: jest.fn(),
      setSpeed: jest.fn(),
      stopTimeline: jest.fn(),
    });

    render(<DemoApp />);

    fireEvent.click(screen.getByTestId('demo-playback-toggle'));
    expect(play).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('demo-playback-toggle'));
    expect(pause).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('demo-playback-reset'));
    expect(seek).toHaveBeenLastCalledWith(0);
  });

  /** @description The animation sidebar and timeline editor must mutate the selected element timeline and drive targeted preview seeks instead of showing placeholder toasts. */
  it('adds keyframes and seeks the selected timeline from the animation editor', async () => {
    const { mockedCreatePlaybackController } = setupDemoShellMocks();
    const seekTimeline = jest.fn(() => null);

    mockedCreatePlaybackController.mockReturnValue({
      attach: jest.fn(),
      destroy: jest.fn(),
      detach: jest.fn(),
      pause: jest.fn(),
      play: jest.fn(),
      seek: jest.fn(),
      seekTimeline,
      setAnimations: jest.fn(),
      setSpeed: jest.fn(),
      stopTimeline: jest.fn(),
    });

    const playbackDocument = createDemoAppPlaybackTestDocument();
    const animatedElementId = 'el-live-ellipse';
    const animatedElement = playbackDocument.elements.find((element) => element.id === animatedElementId);

    expect(animatedElement).toBeDefined();

    if (animatedElement === undefined) {
      throw new Error(`Fixture element ${animatedElementId} is missing`);
    }

    const reorderedDocument = {
      ...playbackDocument,
      elements: [animatedElement, ...playbackDocument.elements.filter((element) => element.id !== animatedElementId)],
    };

    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(reorderedDocument));

    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /animation/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit live pulse/i }));

    expect(screen.getByTestId('timeline-track')).toBeTruthy();
    expect(screen.getAllByTestId('keyframe-marker')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

    expect(screen.getAllByTestId('keyframe-marker')).toHaveLength(3);

    seekTimeline.mockClear();
    fireEvent.click(screen.getByTestId('timeline-track'), { clientX: 180 });

    await waitFor(() => {
      expect(seekTimeline).toHaveBeenCalled();
    });
    expect(seekTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ elementId: animatedElementId, timelineId: 'tl-live-pulse' }),
    );
  });

  /** @description Ensures the shell enforces the dark viewport contract and restores the host page state on unmount. */
  it('applies the dark theme and viewport overflow lock while mounted and restores previous values on unmount', () => {
    setupDemoShellMocks();

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

  /** @description Verifies startup restores local saved work and keeps File menu actions aligned with the layout contract when host onSave is not configured. */
  it('restores a saved document from localStorage and hides the Save file action by default', () => {
    const savedDocument = { ...createDemoAppPlaybackTestDocument(), name: 'Recovered demo layout' };

    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(savedDocument));
    setupDemoShellMocks();
    render(<DemoApp />);

    expect(screen.getByText('Recovered demo layout')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /save as json/i })).toBeTruthy();
  });

  /** @description Prevents the floating menu bar from nesting HeroUI trigger buttons inside other buttons, which breaks layout and accessibility in the real browser. */
  it('renders dropdown triggers without nested buttons in the floating toolbar', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const toolbar = screen.getByTestId('demo-main-toolbar');

    expect(toolbar.querySelector('button button')).toBeNull();
  });

  /** @description Prevents the shell from regressing back to oversized custom chrome by requiring HeroUI toolbar primitives, a square workarea, and a sidebar drawer that stays clear of the top-right toolbar. */
  it('uses compact toolbars and keeps the canvas workarea square beneath the floating sidebar', () => {
    setupDemoShellMocks();
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

  /** @description Keeps navigation first-class by exposing direct zoom controls in the visible toolbar rather than hiding all zoom actions inside menus. */
  it('shows direct zoom controls and updates the zoom level from the toolbar', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const zoomLevel = screen.getByLabelText(/zoom level/i);

    expect(zoomLevel.textContent).toBe('100%');

    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(zoomLevel.textContent).toBe('110%');

    fireEvent.click(screen.getByRole('button', { name: /zoom out/i }));
    expect(zoomLevel.textContent).toBe('100%');
  });

  /** @description Keeps wheel navigation aligned with the canvas spec: plain mouse-wheel scrolling zooms the viewport, modifier keys pan, and trackpad panning still works. */
  it('zooms with mouse wheel scroll while ctrl/alt wheel pans and trackpad panning remains intact', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const preview = screen.getByLabelText(/screen preview for/i);
    const zoomLevel = screen.getByLabelText(/zoom level/i);
    const rendererHost = screen.getByTestId('screen-renderer-host');

    fireEvent.wheel(preview, { deltaMode: 0, deltaY: -120 });
    expect(zoomLevel.textContent).toBe('124%');
    expect(rendererHost.style.transform).toBe('translate(0px, 0px) scale(1.24)');

    fireEvent.wheel(preview, { ctrlKey: true, deltaMode: 1, deltaY: 3 });
    expect(zoomLevel.textContent).toBe('124%');
    expect(rendererHost.style.transform).toBe('translate(-3px, 0px) scale(1.24)');

    fireEvent.wheel(preview, { altKey: true, deltaMode: 1, deltaY: 4 });
    expect(zoomLevel.textContent).toBe('124%');
    expect(rendererHost.style.transform).toBe('translate(-3px, -4px) scale(1.24)');

    fireEvent.wheel(preview, { deltaMode: 0, deltaX: 18, deltaY: 12 });
    expect(zoomLevel.textContent).toBe('124%');
    expect(rendererHost.style.transform).toBe('translate(-21px, -16px) scale(1.24)');
  });

  /** @description Proves the fullscreen control can enter and exit browser fullscreen and reflects the current state. */
  it('toggles fullscreen from the toolbar and updates the button label', async () => {
    setupDemoShellMocks();

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
