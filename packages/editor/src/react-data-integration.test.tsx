/// <reference types="@testing-library/jest-dom/jest-globals" />
import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import React from 'react';

import type { BroadsetDataStore } from './data-store';
import { createDataStore } from './data-store';
import {
  BroadsetDataStoreProvider,
  EditorErrorBoundary,
  EditorProvider,
  useComponentRegistry,
  useDataStoreApi,
  useEditorStore,
  useElementData,
} from './react-data-integration';
import type { EditorStore } from './store-actions';
import { createEditorStore } from './store-actions';

/* ---------- helpers ---------- */

function Wrapper({
  store,
  children,
}: {
  readonly store: BroadsetDataStore;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <BroadsetDataStoreProvider store={store}>{children}</BroadsetDataStoreProvider>;
}

/* =========================================================
   Provider-Scoped Data Access
   ========================================================= */

describe('Provider-Scoped Data Access', () => {
  /** @description Consumer must resolve element data that was seeded into the store. */
  it('returns element data inside provider', () => {
    const store = createDataStore({ 'el-1': { text: 'hello' } });

    function Consumer(): React.JSX.Element {
      const data = useElementData('el-1');

      return <span>{data?.['text'] as string}</span>;
    }

    render(
      <Wrapper store={store}>
        <Consumer />
      </Wrapper>,
    );

    expect(screen.getByText('hello')).toBeTruthy();
  });

  /** @description Querying an unknown element must return undefined so callers can conditionally render. */
  it('returns undefined for missing element', () => {
    const store = createDataStore();
    let result: unknown = 'not-called';

    function Consumer(): React.JSX.Element {
      result = useElementData('missing');

      return <span>ok</span>;
    }

    render(
      <Wrapper store={store}>
        <Consumer />
      </Wrapper>,
    );

    expect(result).toBeUndefined();
  });
});

/* =========================================================
   Provider Boundary Enforcement
   ========================================================= */

describe('Provider Boundary Enforcement', () => {
  /** @description Without a provider, state-selection hooks must throw to surface integration errors early. */
  it('throws when useElementData is used outside provider', () => {
    // Suppress the React error boundary console noise
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    function Bad(): React.JSX.Element {
      useElementData('el-1');

      return <span />;
    }

    expect(() => render(<Bad />)).toThrow();
    spy.mockRestore();
  });

  /** @description Without a provider, raw store API must return null for safe optional use. */
  it('returns null for raw store API outside provider', () => {
    let api: BroadsetDataStore | null = 'sentinel' as unknown as BroadsetDataStore | null;

    function Outer(): React.JSX.Element {
      api = useDataStoreApi();

      return <span>ok</span>;
    }

    render(<Outer />);
    expect(api).toBeNull();
  });
});

/* =========================================================
   Reactive Data Propagation
   ========================================================= */

describe('Reactive Data Propagation', () => {
  /** @description Subscribed consumers must receive new values when the store updates. */
  it('propagates data updates to subscribers', () => {
    const store = createDataStore({ 'el-1': { text: 'initial' } });

    function Consumer(): React.JSX.Element {
      const data = useElementData('el-1');

      return <span data-testid="value">{data?.['text'] as string}</span>;
    }

    render(
      <Wrapper store={store}>
        <Consumer />
      </Wrapper>,
    );

    expect(screen.getByTestId('value').textContent).toBe('initial');

    act(() => {
      store.getState().updateElementData('el-1', { text: 'updated' });
    });

    expect(screen.getByTestId('value').textContent).toBe('updated');
  });
});

/* =========================================================
   Selector Render Isolation
   ========================================================= */

describe('Selector Render Isolation', () => {
  /** @description Only the subscriber whose data changed should re-render, not other subscribers. */
  it('only re-renders the subscriber whose data changed', () => {
    const store = createDataStore({
      'el-1': { text: 'a' },
      'el-2': { text: 'b' },
    });

    let renderCountA = 0;
    let renderCountB = 0;

    function ConsumerA(): React.JSX.Element {
      const data = useElementData('el-1');

      renderCountA++;

      return <span>{data?.['text'] as string}</span>;
    }

    function ConsumerB(): React.JSX.Element {
      const data = useElementData('el-2');

      renderCountB++;

      return <span>{data?.['text'] as string}</span>;
    }

    render(
      <Wrapper store={store}>
        <ConsumerA />
        <ConsumerB />
      </Wrapper>,
    );

    const initialA = renderCountA;
    const initialB = renderCountB;

    act(() => {
      store.getState().updateElementData('el-1', { text: 'changed' });
    });

    // A should have re-rendered, B should not
    expect(renderCountA).toBeGreaterThan(initialA);
    expect(renderCountB).toBe(initialB);
  });
});

/* =========================================================
   Editor Provider Context
   ========================================================= */

describe('Editor Provider Context', () => {
  /** @description Editor store must be accessible via hook inside the provider. */
  it('provides editor store access via hook', () => {
    const editorStore = createEditorStore();
    let storeFromHook: EditorStore | null = null;

    function Consumer(): React.JSX.Element {
      storeFromHook = useEditorStore();

      return <span>ok</span>;
    }

    render(
      <EditorProvider store={editorStore} dataStore={null}>
        <Consumer />
      </EditorProvider>,
    );

    expect(storeFromHook).toBe(editorStore);
  });

  /** @description Component plugins must be available through the provider's registry. */
  it('provides component registry from config', () => {
    const editorStore = createEditorStore();
    const plugins = [{ type: 'custom-widget', label: 'Widget' }];
    let registry: ReadonlyArray<{ readonly type: string }> | null = null;

    function Consumer(): React.JSX.Element {
      registry = useComponentRegistry();

      return <span>ok</span>;
    }

    render(
      <EditorProvider store={editorStore} dataStore={null} components={plugins}>
        <Consumer />
      </EditorProvider>,
    );

    expect(registry).toHaveLength(1);

    const reg = registry as unknown as ReadonlyArray<{ readonly type: string }>;

    expect(reg[0]?.type).toBe('custom-widget');
  });
});

/* =========================================================
   Error Boundary Recovery
   ========================================================= */

describe('Error Boundary Recovery', () => {
  /** @description The error boundary must catch errors and show fallback UI to prevent full app crashes. */
  it('displays fallback UI when a child throws', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    function Bomb(): React.JSX.Element {
      throw new Error('kaboom');
    }

    render(
      <EditorErrorBoundary>
        <Bomb />
      </EditorErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText(/kaboom/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();

    spy.mockRestore();
  });

  /** @description The error boundary must log the error details for debugging. */
  it('logs the error to console.error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    function Bomb(): React.JSX.Element {
      throw new Error('test-error');
    }

    render(
      <EditorErrorBoundary>
        <Bomb />
      </EditorErrorBoundary>,
    );

    // React's error boundary calls console.error with the error
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
