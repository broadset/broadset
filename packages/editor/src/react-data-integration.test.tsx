/** @vitest-environment jsdom */
/// <reference types="@testing-library/jest-dom" />

import { act, render, screen } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createDataStore } from './data-store';
import {
  BroadsetDataStoreProvider,
  EditorErrorBoundary,
  EditorProvider,
  PlaybackProvider,
  type PlaybackState,
  useComponentRegistry,
  useDataStoreApi,
  useEditorStore,
  useElementData,
  usePlayback,
} from './react-data-integration';
import { createEditorStore } from './store-actions';

function DataWrapper({
  store,
  children,
}: {
  readonly store: ReturnType<typeof createDataStore>;
  readonly children: ReactNode;
}) {
  return <BroadsetDataStoreProvider store={store}>{children}</BroadsetDataStoreProvider>;
}

function renderTextValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

describe('provider-scoped data access', () => {
  /** @description Runtime element data must resolve correctly inside provider scope so bound components can read live values without prop drilling. */
  it('returns current element data inside the provider', () => {
    const store = createDataStore({ 'el-1': { text: 'hello' } });

    function Consumer(): React.JSX.Element {
      const data = useElementData('el-1');

      return <span>{renderTextValue(data?.['text'])}</span>;
    }

    render(
      <DataWrapper store={store}>
        <Consumer />
      </DataWrapper>,
    );

    expect(screen.getByText('hello')).toBeTruthy();
  });

  /** @description Missing runtime data must resolve to undefined so callers can branch safely for elements without bound data yet. */
  it('returns undefined when the element has no runtime data', () => {
    const store = createDataStore();
    let lastValue: unknown = 'not-called';

    function Consumer(): React.JSX.Element {
      lastValue = useElementData('missing');

      return <span>ok</span>;
    }

    render(
      <DataWrapper store={store}>
        <Consumer />
      </DataWrapper>,
    );

    expect(lastValue).toBeUndefined();
  });
});

describe('provider boundary enforcement', () => {
  /** @description Using the selector hook outside its provider must throw immediately so integration mistakes fail fast during development. */
  it('throws when useElementData is called outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    function BadConsumer(): React.JSX.Element {
      useElementData('el-1');

      return <span>bad</span>;
    }

    expect(() => render(<BadConsumer />)).toThrow(/provider/i);
    spy.mockRestore();
  });

  /** @description The raw store accessor is intentionally nullable outside provider scope so optional integrations can probe safely. */
  it('returns null for raw store access outside the provider', () => {
    let api: unknown = 'sentinel';

    function Consumer(): React.JSX.Element {
      api = useDataStoreApi();

      return <span>ok</span>;
    }

    render(<Consumer />);

    expect(api).toBeNull();
  });
});

describe('reactive propagation and selector isolation', () => {
  /** @description Subscribers must receive runtime updates as they happen so the editor preview reflects incoming live data. */
  it('re-renders subscribers when their element data changes', () => {
    const store = createDataStore({ 'el-1': { text: 'initial' } });

    function Consumer(): React.JSX.Element {
      const data = useElementData('el-1');

      return <span data-testid="value">{renderTextValue(data?.['text'])}</span>;
    }

    render(
      <DataWrapper store={store}>
        <Consumer />
      </DataWrapper>,
    );

    expect(screen.getByTestId('value').textContent).toBe('initial');

    act(() => {
      store.getState().updateElementData('el-1', { text: 'updated' });
    });

    expect(screen.getByTestId('value').textContent).toBe('updated');
  });

  /** @description Updating one element must not re-render unrelated subscribers so large data-driven documents stay responsive. */
  it('isolates renders to the subscribed element slice that changed', () => {
    const store = createDataStore({
      'el-1': { text: 'alpha' },
      'el-2': { text: 'beta' },
    });
    let rendersA = 0;
    let rendersB = 0;

    function ConsumerA(): React.JSX.Element {
      const data = useElementData('el-1');

      rendersA += 1;

      return <span>{renderTextValue(data?.['text'])}</span>;
    }

    function ConsumerB(): React.JSX.Element {
      const data = useElementData('el-2');

      rendersB += 1;

      return <span>{renderTextValue(data?.['text'])}</span>;
    }

    render(
      <DataWrapper store={store}>
        <ConsumerA />
        <ConsumerB />
      </DataWrapper>,
    );

    const beforeA = rendersA;
    const beforeB = rendersB;

    act(() => {
      store.getState().updateElementData('el-1', { text: 'changed' });
    });

    expect(rendersA).toBeGreaterThan(beforeA);
    expect(rendersB).toBe(beforeB);
  });
});

describe('editor provider and error boundary', () => {
  /** @description The editor provider must expose the editor store and component registry throughout the React tree for all editor shell integrations. */
  it('provides editor store access and registered component plugins', () => {
    const editorStore = createEditorStore();
    const components = [{ type: 'custom-widget', label: 'Widget' }];
    let resolvedStore: unknown = null;
    let resolvedRegistry: unknown = null;

    function Consumer(): React.JSX.Element {
      resolvedStore = useEditorStore();
      resolvedRegistry = useComponentRegistry();

      return <span>ok</span>;
    }

    render(
      <EditorProvider store={editorStore} dataStore={null} components={components}>
        <Consumer />
      </EditorProvider>,
    );

    expect(resolvedStore).toBe(editorStore);
    expect(resolvedRegistry).toEqual(components);
  });

  /** @description The error boundary must catch render crashes, show the recovery UI, and log the error details for debugging instead of crashing the whole app. */
  it('shows fallback UI and logs when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    function Bomb(): React.JSX.Element {
      throw new Error('kaboom');
    }

    render(
      <EditorErrorBoundary>
        <Bomb />
      </EditorErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText(/kaboom/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe('usePlayback hook', () => {
  function requireResult(value: PlaybackState | null): PlaybackState {
    if (value === null) {
      throw new Error('Expected PlaybackState to be set by render');
    }

    return value;
  }

  function lastRafCallback(callbacks: ReadonlyArray<(time: number) => void>): (time: number) => void {
    const cb = callbacks[callbacks.length - 1];

    if (cb === undefined) {
      throw new Error('No RAF callback registered');
    }

    return cb;
  }

  /** @description The playback hook must provide play, pause, seek, stop, and currentTime for timeline preview. */
  it('provides playback control methods inside PlaybackProvider', () => {
    let hookResult: PlaybackState | null = null;

    function Consumer(): React.JSX.Element {
      hookResult = usePlayback();

      return <span>ok</span>;
    }

    render(
      <PlaybackProvider>
        <Consumer />
      </PlaybackProvider>,
    );

    expect(hookResult).not.toBeNull();

    const result = requireResult(hookResult);

    expect(typeof result.play).toBe('function');
    expect(typeof result.pause).toBe('function');
    expect(typeof result.seek).toBe('function');
    expect(typeof result.stop).toBe('function');
    expect(typeof result.currentTime).toBe('number');
    expect(typeof result.speed).toBe('number');
    expect(typeof result.isPlaying).toBe('boolean');
  });

  /** @description usePlayback must throw outside its provider to fail fast on integration mistakes. */
  it('throws when used outside PlaybackProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    function BadConsumer(): React.JSX.Element {
      usePlayback();

      return <span>bad</span>;
    }

    expect(() => render(<BadConsumer />)).toThrow(/provider/i);
    spy.mockRestore();
  });

  /** @description Play should set isPlaying to true and advance currentTime from 0. */
  it('play sets isPlaying to true and advances currentTime', () => {
    let hookResult: PlaybackState | null = null;
    const rafCallbacks: Array<(time: number) => void> = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb as (time: number) => void);

      return rafCallbacks.length;
    });
    const cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    function Consumer(): React.JSX.Element {
      hookResult = usePlayback();

      return <span>{hookResult.isPlaying ? 'playing' : 'stopped'}</span>;
    }

    render(
      <PlaybackProvider>
        <Consumer />
      </PlaybackProvider>,
    );

    expect(requireResult(hookResult).isPlaying).toBe(false);
    expect(requireResult(hookResult).currentTime).toBe(0);

    act(() => {
      requireResult(hookResult).play();
    });

    expect(requireResult(hookResult).isPlaying).toBe(true);

    // First RAF frame sets lastFrame timestamp (no delta yet)
    act(() => {
      lastRafCallback(rafCallbacks)(100);
    });

    // Second frame advances by delta (200 - 100 = 100ms)
    act(() => {
      lastRafCallback(rafCallbacks)(200);
    });

    expect(requireResult(hookResult).currentTime).toBe(100);

    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  /** @description Pause should stop advancing currentTime at the current position. */
  it('pause stops playback and preserves currentTime', () => {
    let hookResult: PlaybackState | null = null;
    const rafCallbacks: Array<(time: number) => void> = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb as (time: number) => void);

      return rafCallbacks.length;
    });
    const cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    function Consumer(): React.JSX.Element {
      hookResult = usePlayback();

      return <span>ok</span>;
    }

    render(
      <PlaybackProvider>
        <Consumer />
      </PlaybackProvider>,
    );

    act(() => {
      requireResult(hookResult).play();
    });

    // Advance time by 50ms (two frames: 0→100, 100→150)
    act(() => {
      lastRafCallback(rafCallbacks)(100);
    });

    act(() => {
      lastRafCallback(rafCallbacks)(150);
    });

    const timeBeforePause = requireResult(hookResult).currentTime;

    expect(timeBeforePause).toBe(50);

    act(() => {
      requireResult(hookResult).pause();
    });

    expect(requireResult(hookResult).isPlaying).toBe(false);
    expect(requireResult(hookResult).currentTime).toBe(timeBeforePause);

    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  /** @description Seek should set currentTime to the requested offset. */
  it('seek sets currentTime to the specified offset', () => {
    let hookResult: PlaybackState | null = null;

    function Consumer(): React.JSX.Element {
      hookResult = usePlayback();

      return <span>{hookResult.currentTime}</span>;
    }

    render(
      <PlaybackProvider>
        <Consumer />
      </PlaybackProvider>,
    );

    act(() => {
      requireResult(hookResult).seek(1500);
    });

    expect(requireResult(hookResult).currentTime).toBe(1500);
  });

  /** @description Stop must halt playback and reset currentTime to zero, not just pause at the current position. */
  it('stop halts playback and resets currentTime to zero', () => {
    let hookResult: PlaybackState | null = null;

    function Consumer(): React.JSX.Element {
      hookResult = usePlayback();

      return <span>ok</span>;
    }

    render(
      <PlaybackProvider>
        <Consumer />
      </PlaybackProvider>,
    );

    act(() => {
      requireResult(hookResult).seek(500);
    });

    act(() => {
      requireResult(hookResult).play();
    });

    act(() => {
      requireResult(hookResult).stop();
    });

    expect(requireResult(hookResult).isPlaying).toBe(false);
    expect(requireResult(hookResult).currentTime).toBe(0);
  });
});
