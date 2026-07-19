import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { TimelineEditingProvider, useTimelineEditing } from './timeline-context';
import { sortTimelineLanes } from './timeline-types';

function wrapper({ children }: { readonly children: ReactNode }): JSX.Element {
  return <TimelineEditingProvider>{children}</TimelineEditingProvider>;
}

describe('TimelineEditingContext', () => {
  it('returns null outside the provider', () => {
    const { result } = renderHook(() => useTimelineEditing());

    expect(result.current).toBeNull();
  });

  it('stores stable canonical identities on open and clears them on close', () => {
    const { result } = renderHook(() => useTimelineEditing(), { wrapper });

    act(() => {
      result.current?.openSequence({ documentId: 'doc-1' }, 'seq-1', 'track-1');
    });
    expect(result.current?.target).toEqual({
      owner: { documentId: 'doc-1' },
      sequenceId: 'seq-1',
      trackId: 'track-1',
    });

    act(() => {
      result.current?.closeSequence();
    });
    expect(result.current?.target).toBeNull();
  });
});

describe('sortTimelineLanes', () => {
  it('orders selection-targeting tracks first, then by stable sort key', () => {
    const lane = (id: string, sortKey: string, targetsSelection: boolean) => ({
      id,
      label: id,
      sortKey,
      targetsSelection,
      keyframes: [],
    });
    const sorted = sortTimelineLanes([
      lane('c', 'el-z /appearance/opacity', false),
      lane('a', 'el-b /geometry/bounds/width', false),
      lane('b', 'el-a /appearance/opacity', true),
    ]);

    expect(sorted.map(({ id }) => id)).toEqual(['b', 'a', 'c']);
  });
});
