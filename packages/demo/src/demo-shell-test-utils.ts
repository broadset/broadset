import './demo-app-test-helpers';

import { createPlaybackController } from '@broadset/playback';
import { createScreenRenderer } from '@broadset/renderer';
import { act } from '@testing-library/react';

interface DemoShellMocks {
  readonly mockedCreatePlaybackController: jest.MockedFunction<typeof createPlaybackController>;
  readonly mockedCreateScreenRenderer: jest.MockedFunction<typeof createScreenRenderer>;
}

export function setupDemoShellMocks(): DemoShellMocks {
  const mockedCreateScreenRenderer = jest.mocked(createScreenRenderer);
  const mockedCreatePlaybackController = jest.mocked(createPlaybackController);

  mockedCreateScreenRenderer.mockReturnValue({
    destroy: jest.fn(),
    host: document.createElement('div'),
    updateDocument: jest.fn(),
  });
  mockedCreatePlaybackController.mockReturnValue({
    attach: jest.fn(),
    destroy: jest.fn(),
    detach: jest.fn(),
    pause: jest.fn(),
    play: jest.fn(),
    seek: jest.fn(),
    seekTimeline: jest.fn(),
    setAnimations: jest.fn(),
    setSpeed: jest.fn(),
    stopTimeline: jest.fn(),
  });

  return { mockedCreatePlaybackController, mockedCreateScreenRenderer };
}

export function dispatchDeleteKey(): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
  });
}
