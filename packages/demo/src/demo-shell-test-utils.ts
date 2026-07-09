import './demo-app-test-helpers';

import type { EditorStore } from '@broadset/editor';
import { computeTimelineFrame, createPlaybackController } from '@broadset/playback';
import { createScreenRenderer } from '@broadset/renderer';
import { act } from '@testing-library/react';
import type { MockedFunction } from 'vitest';
import { vi } from 'vitest';

/*
 * SCOPE: this helper stubs the screen renderer and playback controller so
 * unit-scope tests can mount <DemoApp /> without booting the full renderer.
 * Real rendering and playback timing are intentionally not exercised here —
 * those behaviors are validated end-to-end in
 * `packages/demo/ct/state/demo-state-data.ct.tsx` and the snapshot and
 * panel-to-canvas parity CTs in `packages/demo/ct/`.
 *
 * If a unit test depends on the real renderer's output, panel-to-canvas
 * style propagation, or playback timing, it should be a CT, not a unit test.
 */

interface DemoShellMocks {
  readonly mockedComputeTimelineFrame: MockedFunction<typeof computeTimelineFrame>;
  readonly mockedCreatePlaybackController: MockedFunction<typeof createPlaybackController>;
  readonly mockedCreateScreenRenderer: MockedFunction<typeof createScreenRenderer>;
}

export function setupDemoShellMocks(): DemoShellMocks {
  const mockedComputeTimelineFrame = vi.mocked(computeTimelineFrame);
  const mockedCreateScreenRenderer = vi.mocked(createScreenRenderer);
  const mockedCreatePlaybackController = vi.mocked(createPlaybackController);

  const overlayRoot = document.createElement('div');

  overlayRoot.setAttribute('data-broadset-overlay-root', 'true');
  // React portals only render into DOM nodes attached to the document. The
  // real renderer attaches overlayRoot inside canvasRoot; in unit tests we
  // append it to document.body so Testing Library's queries can reach the
  // widget.
  document.body.appendChild(overlayRoot);

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

  return { mockedComputeTimelineFrame, mockedCreatePlaybackController, mockedCreateScreenRenderer };
}

export function dispatchDeleteKey(): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
  });
}

/**
 * Enables the experimental-features flag on the active demo editor store so
 * tests that depend on experimental UI surfaces (animation sidebar, preflight,
 * export modal, template browser, unit/view-mode pickers, motion path, etc.)
 * can see those surfaces. The flag defaults to `false` in production; tests
 * that exercise those surfaces must opt in.
 */
export function enableExperimentalFeatures(): void {
  const globalStore = (window as unknown as { readonly __broadsetEditorStore?: EditorStore }).__broadsetEditorStore;

  if (globalStore === undefined) {
    throw new Error('enableExperimentalFeatures must be called after DemoApp is mounted');
  }

  act(() => {
    globalStore.getState().updateCanvasSettings({ showExperimentalFeatures: true });
  });
}
