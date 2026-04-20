import './demo-app-test-helpers';

import { createPlaybackController } from '@broadset/playback';
import { createScreenRenderer } from '@broadset/renderer';
import { act } from '@testing-library/react';
import type { MockedFunction } from 'vitest';
import { vi } from 'vitest';

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
