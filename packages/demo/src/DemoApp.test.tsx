/** @jest-environment jsdom */

import { createPlaybackController } from '@broadset/playback';
import { createScreenRenderer } from '@broadset/renderer';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import { DemoApp } from './DemoApp';

interface MockHeroUiProps {
  readonly children?: React.ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly startContent?: React.ReactNode;
  readonly [key: string]: unknown;
}

const mockReact = React;

jest.mock(
  '@heroui/react',
  () => {
    function createWrapper(tagName = 'div') {
      return function Wrapper(props: MockHeroUiProps): React.JSX.Element {
        const { children, ...restProps } = props;

        return mockReact.createElement(tagName, restProps, children ?? null);
      };
    }

    return {
      Button(props: MockHeroUiProps): React.JSX.Element {
        const { children, onPress, startContent, ...restProps } = props;
        const onClick = typeof onPress === 'function' ? onPress : undefined;

        return mockReact.createElement('button', { ...restProps, onClick }, startContent ?? null, children ?? null);
      },
      Card: createWrapper(),
      CardContent: createWrapper(),
      CardDescription: createWrapper('p'),
      CardHeader: createWrapper(),
      CardTitle: createWrapper('h2'),
      Chip: createWrapper('span'),
      Separator: createWrapper('hr'),
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
});
