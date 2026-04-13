import { createDataStore } from '@broadset/editor';
import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';

import {
  applyLiveUpdate,
  INITIAL_LIVE_DATA,
  LIVE_DATA_ELEMENT_IDS,
  type LiveDataValues,
  populateInitialData,
  simulateLiveUpdate,
  useLiveData,
} from './useLiveData';

describe('live data injection — initial values', () => {
  /** @description The demo MUST seed the data store with initial placeholder values for score, clock, and ticker so elements render non-empty content on first paint. */
  it('provides initial live data values for scores, clock, and ticker', () => {
    expect(INITIAL_LIVE_DATA.homeScore).toBeDefined();
    expect(typeof INITIAL_LIVE_DATA.homeScore).toBe('number');
    expect(INITIAL_LIVE_DATA.awayScore).toBeDefined();
    expect(typeof INITIAL_LIVE_DATA.awayScore).toBe('number');
    expect(INITIAL_LIVE_DATA.clock).toBeDefined();
    expect(typeof INITIAL_LIVE_DATA.clock).toBe('string');
    expect(INITIAL_LIVE_DATA.ticker).toBeDefined();
    expect(Array.isArray(INITIAL_LIVE_DATA.ticker)).toBe(true);
    expect(INITIAL_LIVE_DATA.ticker.length).toBeGreaterThan(0);
  });

  /** @description populateInitialData MUST push the initial values into the data store so bound elements can read them immediately. */
  it('populates the data store with initial live data', () => {
    const store = createDataStore();

    populateInitialData(store);

    const state = store.getState();

    // Score elements should have data
    expect(state.elements[LIVE_DATA_ELEMENT_IDS.homeScore]?.['text']).toBeDefined();
    expect(state.elements[LIVE_DATA_ELEMENT_IDS.awayScore]?.['text']).toBeDefined();
    // Clock element should have data
    expect(state.elements[LIVE_DATA_ELEMENT_IDS.clock]?.['text']).toBeDefined();
    // Ticker element should have data
    expect(state.elements[LIVE_DATA_ELEMENT_IDS.ticker]?.['text']).toBeDefined();
  });
});

describe('live data injection — periodic updates', () => {
  /** @description simulateLiveUpdate MUST return new values that differ from the input so the data store actually updates on each tick. */
  it('produces a new set of values that differs from the input', () => {
    const initial: LiveDataValues = { ...INITIAL_LIVE_DATA };
    const updated = simulateLiveUpdate(initial);

    expect(updated).not.toEqual(initial);
    expect(updated.clock).not.toBe(initial.clock);
    expect(updated.ticker).not.toEqual(initial.ticker);
  });

  /** @description simulateLiveUpdate MUST always advance the clock string so the display shows a changing timestamp. */
  it('decrements the clock by one second', () => {
    const initial: LiveDataValues = { ...INITIAL_LIVE_DATA };
    const updated = simulateLiveUpdate(initial);

    // INITIAL_LIVE_DATA.clock is 'Q4 · 01:42' — after one tick it should be 'Q4 · 01:41'
    expect(updated.clock).toBe('Q4 · 01:41');
  });

  /** @description Applying the updated values to the data store MUST update the elements so subscribers see fresh data without full re-render. */
  it('pushes updated values into the data store', () => {
    const store = createDataStore();

    populateInitialData(store);

    // Simulate an update
    const updated = simulateLiveUpdate(INITIAL_LIVE_DATA);

    applyLiveUpdate(store, updated);

    const elements = store.getState().elements;

    // All four live data fields should be updated
    expect(elements[LIVE_DATA_ELEMENT_IDS.homeScore]?.['text']).toBe(String(updated.homeScore));
    expect(elements[LIVE_DATA_ELEMENT_IDS.awayScore]?.['text']).toBe(String(updated.awayScore));
    expect(elements[LIVE_DATA_ELEMENT_IDS.clock]?.['text']).toBe(updated.clock);
    expect(elements[LIVE_DATA_ELEMENT_IDS.ticker]?.['text']).toBe(JSON.stringify(updated.ticker));
  });
});

describe('useLiveData hook lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** @description The hook MUST seed the data store with initial values on mount so elements render non-empty content immediately. */
  it('seeds the data store on mount', () => {
    const store = createDataStore();

    renderHook(() => {
      useLiveData(store, 5000);
    });

    const elements = store.getState().elements;

    expect(elements[LIVE_DATA_ELEMENT_IDS.homeScore]?.['text']).toBe(String(INITIAL_LIVE_DATA.homeScore));
    expect(elements[LIVE_DATA_ELEMENT_IDS.clock]?.['text']).toBe(INITIAL_LIVE_DATA.clock);
  });

  /** @description The hook MUST push periodic updates into the data store so bound elements reflect changing live data. */
  it('pushes periodic updates after the interval elapses', () => {
    const store = createDataStore();

    renderHook(() => {
      useLiveData(store, 1000);
    });

    const clockBefore = store.getState().elements[LIVE_DATA_ELEMENT_IDS.clock]?.['text'];

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    const clockAfter = store.getState().elements[LIVE_DATA_ELEMENT_IDS.clock]?.['text'];

    expect(clockAfter).not.toBe(clockBefore);
  });

  /** @description The hook MUST clean up the interval on unmount to avoid memory leaks and stale updates. */
  it('clears the interval on unmount', () => {
    const store = createDataStore();

    const { unmount } = renderHook(() => {
      useLiveData(store, 1000);
    });

    const clockAfterMount = store.getState().elements[LIVE_DATA_ELEMENT_IDS.clock]?.['text'];

    unmount();

    // Advance timer after unmount — clock should NOT change
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const clockAfterUnmount = store.getState().elements[LIVE_DATA_ELEMENT_IDS.clock]?.['text'];

    expect(clockAfterUnmount).toBe(clockAfterMount);
  });
});
