import './demo-app-test-helpers';

import { createPlaybackController } from '@broadset/playback';
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
  readonly mockedCreatePlaybackController: MockedFunction<typeof createPlaybackController>;
  readonly mockedCreateScreenRenderer: MockedFunction<typeof createScreenRenderer>;
}

export function setupDemoShellMocks(): DemoShellMocks {
  const mockedCreateScreenRenderer = vi.mocked(createScreenRenderer);
  const mockedCreatePlaybackController = vi.mocked(createPlaybackController);

  mockedCreateScreenRenderer.mockReturnValue({
    destroy: vi.fn(),
    host: document.createElement('div'),
    updateDocument: vi.fn(),
  });
  mockedCreatePlaybackController.mockReturnValue({
    attach: vi.fn(),
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

  return { mockedCreatePlaybackController, mockedCreateScreenRenderer };
}

export function dispatchDeleteKey(): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
  });
}
