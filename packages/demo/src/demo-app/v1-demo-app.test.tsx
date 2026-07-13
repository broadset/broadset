import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { DemoApp } from '../DemoApp';
import { V1DemoApp } from './v1-demo-app';

describe('V1DemoApp', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, '__broadsetProjectEditorStore', {
      configurable: true,
      value: undefined,
    });
  });

  it('boots the production host with a semantically valid v1 project store', async () => {
    render(<V1DemoApp />);

    expect(screen.getByTestId('v1-demo-workspace')).toBeTruthy();

    await waitFor(() => {
      expect(window.__broadsetProjectEditorStore).toBeDefined();
    });

    const store: ProjectEditorStore | undefined = window.__broadsetProjectEditorStore;

    if (store === undefined) throw new Error('Expected the production v1 editor store');

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('exposes the v1 host from the public DemoApp entry', () => {
    render(<DemoApp />);

    expect(screen.getByTestId('v1-demo-workspace')).toBeTruthy();
  });
});
