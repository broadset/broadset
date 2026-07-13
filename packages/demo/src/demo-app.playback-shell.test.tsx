/** @vitest-environment jsdom */

import './demo-app-test-helpers';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DemoApp } from './demo-app/app';
import { enableExperimentalFeatures, setupDemoShellMocks } from './demo-shell-test-utils';
import { createDemoAppPlaybackTestDocument } from './test-fixtures';

describe('DemoApp playback shell lifecycle', () => {
  /** @description Guards against rebuilding the animated preview controller when the demo shell rerenders. */
  it('does not recreate the renderer or playback controller when the shell rerenders with the same document', () => {
    const rendererDestroy = vi.fn();
    const updateDocument = vi.fn();
    const playbackDestroy = vi.fn();
    const attach = vi.fn();
    const pause = vi.fn();
    const play = vi.fn();
    const seek = vi.fn();
    const setAnimations = vi.fn();
    const setSpeed = vi.fn();
    const seekTimeline = vi.fn();
    const stopTimeline = vi.fn();
    const { mockedCreatePlaybackController, mockedCreateScreenRenderer } = setupDemoShellMocks();

    const overlayRoot = document.body.appendChild(document.createElement('div'));

    mockedCreateScreenRenderer.mockReturnValue({
      destroy: vi.fn(() => {
        overlayRoot.remove();
        rendererDestroy();
      }),
      getOverlayRoot: vi.fn(() => overlayRoot),
      host: document.createElement('div'),
      updateDocument,
      updateSettings: vi.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach,
      clearStyles: vi.fn(),
      destroy: playbackDestroy,
      detach: vi.fn(),
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
    expect(seek).not.toHaveBeenCalled();

    rerender(<DemoApp />);

    expect(mockedCreateScreenRenderer).toHaveBeenCalledTimes(1);
    expect(mockedCreatePlaybackController).toHaveBeenCalledTimes(1);
    expect(rendererDestroy).not.toHaveBeenCalled();
    expect(playbackDestroy).not.toHaveBeenCalled();

    unmount();

    expect(rendererDestroy).toHaveBeenCalledTimes(1);
    expect(playbackDestroy).toHaveBeenCalledTimes(1);
  });

  /** @description Change-batch console logging must stay disabled by default so interactive editing does not flood logs or slow tests. */
  it('does not emit change-batch logs by default', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {
      /* no-op */
    });

    try {
      setupDemoShellMocks();
      render(<DemoApp />);
      enableExperimentalFeatures();

      fireEvent.click(screen.getByRole('button', { name: /animation/i }));
      fireEvent.click(screen.getByRole('button', { name: /add timeline/i }));

      expect(infoSpy).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
    }
  });

  /** @description Proves the play, pause, and reset controls dispatch the expected playback API calls. */
  it('wires the play/pause toggle and reset controls to the playback controller', () => {
    const { mockedCreatePlaybackController } = setupDemoShellMocks();
    const play = vi.fn();
    const pause = vi.fn();
    const seek = vi.fn();

    mockedCreatePlaybackController.mockReturnValue({
      attach: vi.fn(),
      clearStyles: vi.fn(),
      destroy: vi.fn(),
      detach: vi.fn(),
      pause,
      play,
      seek,
      seekTimeline: vi.fn(),
      setAnimations: vi.fn(),
      setSpeed: vi.fn(),
      stopTimeline: vi.fn(),
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
    const { mockedComputeTimelineFrame, mockedCreatePlaybackController, mockedCreateScreenRenderer } =
      setupDemoShellMocks();
    const updateDocument = vi.fn();
    const overlayRoot = document.body.appendChild(document.createElement('div'));
    const seek = vi.fn();
    const seekTimeline = vi.fn(() => null);

    mockedCreateScreenRenderer.mockReturnValue({
      destroy: vi.fn(() => {
        overlayRoot.remove();
      }),
      getOverlayRoot: vi.fn(() => overlayRoot),
      host: document.createElement('div'),
      updateDocument,
      updateSettings: vi.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: vi.fn(),
      clearStyles: vi.fn(),
      destroy: vi.fn(),
      detach: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      seek,
      seekTimeline,
      setAnimations: vi.fn(),
      setSpeed: vi.fn(),
      stopTimeline: vi.fn(),
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
    enableExperimentalFeatures();

    fireEvent.click(screen.getByRole('button', { name: /animation/i }));
    fireEvent.click(screen.getByTestId('demo-playback-toggle'));
    fireEvent.click(screen.getByRole('button', { name: /edit live pulse/i }));

    await waitFor(() => {
      expect(seek).toHaveBeenCalledWith(0);
    });
    expect(screen.getByTestId('timeline-track')).toBeTruthy();
    expect(screen.getAllByTestId('keyframe-marker')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

    expect(screen.getAllByTestId('keyframe-marker')).toHaveLength(3);

    mockedComputeTimelineFrame.mockClear();
    updateDocument.mockClear();
    seekTimeline.mockClear();
    fireEvent.click(screen.getByTestId('timeline-track'), { clientX: 180 });

    await waitFor(() => {
      expect(updateDocument).toHaveBeenCalled();
    });

    const pulseSeekCall = mockedComputeTimelineFrame.mock.calls.find(
      ([options]) => options.timeline.id === 'tl-live-pulse',
    );

    expect(pulseSeekCall).toBeDefined();
    expect(seekTimeline).not.toHaveBeenCalled();
  });

  /** @description Pressing play at the end of a non-loop timeline must restart preview from 0 so users can replay without manually seeking backward first. */
  it('restarts non-loop timeline playback from 0 when play is pressed at the end of the track', async () => {
    const { mockedComputeTimelineFrame, mockedCreatePlaybackController, mockedCreateScreenRenderer } =
      setupDemoShellMocks();
    const updateDocument = vi.fn();
    const overlayRoot = document.body.appendChild(document.createElement('div'));
    const seekTimeline = vi.fn(() => null);

    mockedCreateScreenRenderer.mockReturnValue({
      destroy: vi.fn(() => {
        overlayRoot.remove();
      }),
      getOverlayRoot: vi.fn(() => overlayRoot),
      host: document.createElement('div'),
      updateDocument,
      updateSettings: vi.fn(),
    });
    mockedCreatePlaybackController.mockReturnValue({
      attach: vi.fn(),
      clearStyles: vi.fn(),
      destroy: vi.fn(),
      detach: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      seek: vi.fn(),
      seekTimeline,
      setAnimations: vi.fn(),
      setSpeed: vi.fn(),
      stopTimeline: vi.fn(),
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
    enableExperimentalFeatures();

    fireEvent.click(screen.getByRole('button', { name: /animation/i }));
    fireEvent.click(screen.getByRole('button', { name: /add timeline/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit timeline 2/i }));

    fireEvent.click(screen.getByTestId('timeline-track'), { clientX: 99_999 });

    mockedComputeTimelineFrame.mockClear();
    updateDocument.mockClear();
    seekTimeline.mockClear();
    fireEvent.click(screen.getByTestId('demo-playback-toggle'));

    await waitFor(() => {
      expect(mockedComputeTimelineFrame).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMs: 0,
        }),
      );
    });
    expect(updateDocument).toHaveBeenCalled();
    expect(seekTimeline).not.toHaveBeenCalled();
  });

  /** @description Timeline preview playback must cancel its RAF loop before timeline mutations so stale frames cannot keep overwriting the edited timeline preview. */
  it('stops timeline preview playback before mutating the edited timeline', () => {
    const { mockedCreatePlaybackController, mockedCreateScreenRenderer } = setupDemoShellMocks();
    const overlayRoot = document.body.appendChild(document.createElement('div'));
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 123);
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      /* no-op */
    });

    try {
      mockedCreateScreenRenderer.mockReturnValue({
        destroy: vi.fn(() => {
          overlayRoot.remove();
        }),
        getOverlayRoot: vi.fn(() => overlayRoot),
        host: document.createElement('div'),
        updateDocument: vi.fn(),
        updateSettings: vi.fn(),
      });
      mockedCreatePlaybackController.mockReturnValue({
        attach: vi.fn(),
        clearStyles: vi.fn(),
        destroy: vi.fn(),
        detach: vi.fn(),
        pause: vi.fn(),
        play: vi.fn(),
        seek: vi.fn(),
        seekTimeline: vi.fn(),
        setAnimations: vi.fn(),
        setSpeed: vi.fn(),
        stopTimeline: vi.fn(),
      });

      const playbackDocument = createDemoAppPlaybackTestDocument();
      const animatedElementId = 'el-live-ellipse';
      const animatedElement = playbackDocument.elements.find((element) => element.id === animatedElementId);

      if (animatedElement === undefined) {
        throw new Error(`Fixture element ${animatedElementId} is missing`);
      }

      window.localStorage.setItem(
        'broadset:demo-document:v1',
        JSON.stringify({
          ...playbackDocument,
          elements: [
            animatedElement,
            ...playbackDocument.elements.filter((element) => element.id !== animatedElementId),
          ],
        }),
      );

      render(<DemoApp />);
      enableExperimentalFeatures();

      fireEvent.click(screen.getByRole('button', { name: /animation/i }));
      fireEvent.click(screen.getByRole('button', { name: /edit live pulse/i }));
      fireEvent.click(screen.getByTestId('demo-playback-toggle'));

      expect(requestAnimationFrameSpy).toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

      expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(123);
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
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

    expect(screen.getByLabelText(/Screen preview for Recovered demo layout/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /save as json/i })).toBeTruthy();
  });

  /** @description Opening a document in edit mode must force all elements visible by default, even when imported pages contain persisted visibility-off overrides. */
  it('applies page visibility overrides to the canvas preview', () => {
    const { mockedCreateScreenRenderer } = setupDemoShellMocks();
    const updateDocument = vi.fn();
    const fixtureDocument = createDemoAppPlaybackTestDocument();
    const replayElementId = 'el-live-ellipse';

    const overlayRoot = document.body.appendChild(document.createElement('div'));

    mockedCreateScreenRenderer.mockReturnValue({
      destroy: vi.fn(() => {
        overlayRoot.remove();
      }),
      getOverlayRoot: vi.fn(() => overlayRoot),
      host: document.createElement('div'),
      updateDocument,
      updateSettings: vi.fn(),
    });
    window.localStorage.setItem(
      'broadset:demo-document:v1',
      JSON.stringify({
        ...fixtureDocument,
        pages: fixtureDocument.pages.map((page, index) =>
          index === 0 ?
            {
              ...page,
              elements: [
                ...page.elements,
                {
                  elementId: replayElementId,
                  transform: {
                    position: { x: 0, y: 0, z: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    scale: { x: 1, y: 1, z: 1 },
                  },
                  visible: false,
                },
              ],
            }
          : page,
        ),
      }),
    );

    render(<DemoApp />);

    const hasReplayElementInUpdates = updateDocument.mock.calls.some((call) => {
      const [documentArg] = call as [{ readonly elements: readonly { readonly id: string }[] }];

      return documentArg.elements.some((element) => element.id === replayElementId);
    });

    // The replay element should be hidden on page 0 due to visibility override
    expect(hasReplayElementInUpdates).toBe(false);
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

  /** @description Mouse-wheel rotation always zooms (never pans), trackpad scroll pans, and trackpad pinch (ctrlKey-synthesized) zooms. */
  it('mouse-wheel zooms, trackpad scroll pans, trackpad pinch zooms', async () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const preview = screen.getByLabelText(/screen preview for/i);
    const zoomLevel = screen.getByLabelText(/zoom level/i);
    const rendererHost = screen.getByTestId('screen-renderer-host');
    const panLayer = screen.getByTestId('screen-pan-layer');

    // Physical mouse wheel: one notch up → zoom in, pan stays at origin.
    fireEvent.wheel(preview, { deltaMode: 0, deltaY: -120, wheelDeltaY: 120 });
    await waitFor(() => {
      expect(zoomLevel.textContent).toBe('124%');
      expect(rendererHost.style.transform).toBe('scale(1.24)');
      expect(panLayer.style.transform).toBe('translate(0px, 0px)');
    });

    // Trackpad two-finger scroll: no ctrl, small non-integer delta → pans,
    // zoom unchanged.
    fireEvent.wheel(preview, { deltaMode: 0, deltaX: 18, deltaY: 12 });
    await waitFor(() => {
      expect(zoomLevel.textContent).toBe('124%');
      expect(rendererHost.style.transform).toBe('scale(1.24)');
      expect(panLayer.style.transform).toBe('translate(-18px, -12px)');
    });

    // Trackpad pinch: browsers synthesize ctrlKey for pinch → zoom at cursor.
    fireEvent.wheel(preview, { ctrlKey: true, deltaMode: 0, deltaY: -50 });
    await waitFor(() => {
      const percent = Number.parseInt(zoomLevel.textContent, 10);

      expect(percent).toBeGreaterThan(124);
    });
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
      value: vi.fn().mockImplementation(() => {
        fullscreenElement = document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));

        return Promise.resolve();
      }),
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn().mockImplementation(() => {
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
