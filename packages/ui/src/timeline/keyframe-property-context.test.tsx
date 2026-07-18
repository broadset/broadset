import { renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  type KeyframePropertyAdapter,
  KeyframePropertyProvider,
  useKeyframePropertyAdapter,
} from './keyframe-property-context';

describe('KeyframePropertyContext', () => {
  it('returns null outside a provider and in normal mode', () => {
    expect(renderHook(() => useKeyframePropertyAdapter()).result.current).toBeNull();

    const normalMode = ({ children }: { readonly children: ReactNode }): JSX.Element => (
      <KeyframePropertyProvider adapter={null}>{children}</KeyframePropertyProvider>
    );

    expect(renderHook(() => useKeyframePropertyAdapter(), { wrapper: normalMode }).result.current).toBeNull();
  });

  it('exposes the adapter in keyframe mode', () => {
    const adapter: KeyframePropertyAdapter = {
      target: { entityId: 'el-1', pointer: '/appearance/opacity' },
      getValue: () => 0.5,
      updateValue: vi.fn(() => true),
      createTrack: vi.fn(() => true),
      removeKeyframe: vi.fn(() => true),
    };
    const wrapper = ({ children }: { readonly children: ReactNode }): JSX.Element => (
      <KeyframePropertyProvider adapter={adapter}>{children}</KeyframePropertyProvider>
    );
    const { result } = renderHook(() => useKeyframePropertyAdapter(), { wrapper });

    expect(result.current?.getValue()).toBe(0.5);
  });
});
