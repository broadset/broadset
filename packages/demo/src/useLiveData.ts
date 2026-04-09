import type { BroadsetDataStore } from '@broadset/editor';
import { useEffect, useRef } from 'react';

/** Runtime live data values fed into the demo data store. */
export interface LiveDataValues {
  readonly homeScore: number;
  readonly awayScore: number;
  readonly clock: string;
  readonly ticker: readonly string[];
}

/** Default interval in ms for mock live updates. */
const DEFAULT_UPDATE_INTERVAL_MS = 3000;

/** Probability (0–1) that either team scores on a given update tick. */
const SCORE_PROBABILITY = 0.05;

/** Element IDs that the live data feed writes to. */
export const LIVE_DATA_ELEMENT_IDS = {
  homeScore: 'el-home-score',
  awayScore: 'el-away-score',
  clock: 'el-clock',
  ticker: 'el-ticker',
} as const;

/** Initial placeholder values for the demo live data feed. */
export const INITIAL_LIVE_DATA: LiveDataValues = {
  homeScore: 2,
  awayScore: 1,
  clock: 'Q4 · 01:42',
  ticker: [
    "GOAL — North City FC 2-1 (J. Rivera, 73')",
    'Yellow card — Harbor United #8 (K. Osei)',
    'VAR review in progress — possible penalty',
  ],
};

/**
 * Seed element data entries in the store so bound elements render
 * non-empty content on first paint.
 */
export function populateInitialData(store: BroadsetDataStore): void {
  applyLiveUpdate(store, INITIAL_LIVE_DATA);
}

/**
 * Push live data values into per-element entries in the data store.
 */
export function applyLiveUpdate(store: BroadsetDataStore, values: LiveDataValues): void {
  store.getState().bulkUpdate({
    [LIVE_DATA_ELEMENT_IDS.homeScore]: { text: String(values.homeScore) },
    [LIVE_DATA_ELEMENT_IDS.awayScore]: { text: String(values.awayScore) },
    [LIVE_DATA_ELEMENT_IDS.clock]: { text: values.clock },
    [LIVE_DATA_ELEMENT_IDS.ticker]: { text: JSON.stringify(values.ticker) },
  });
}

/**
 * Produce a new {@link LiveDataValues} by randomly advancing the clock and
 * occasionally changing the score.  The ticker rotates its first item to the
 * end to simulate scrolling headlines.
 */
export function simulateLiveUpdate(previous: LiveDataValues): LiveDataValues {
  // Parse the "Qn · mm:ss" clock string
  const clockMatch = /^(Q\d) · (\d{2}):(\d{2})$/.exec(previous.clock);
  let nextClock: string;

  if (clockMatch !== null) {
    const quarter = clockMatch[1] ?? 'Q4';
    const minutes = Number(clockMatch[2] ?? '0');
    const seconds = Number(clockMatch[3] ?? '0');
    const totalSeconds = Math.max(0, minutes * 60 + seconds - 1);
    const nextMin = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const nextSec = String(totalSeconds % 60).padStart(2, '0');

    nextClock = `${quarter} · ${nextMin}:${nextSec}`;
  } else {
    nextClock = 'Q4 · 00:00';
  }

  // ~5% chance home scores, ~5% chance away scores (mutually exclusive per tick)
  const scoreChance = Math.random();
  const homeScoreDelta = scoreChance < SCORE_PROBABILITY ? 1 : 0;
  const awayScoreDelta = scoreChance >= SCORE_PROBABILITY && scoreChance < SCORE_PROBABILITY * 2 ? 1 : 0;

  // Rotate ticker items
  const rotatedTicker =
    previous.ticker.length > 1 ? [...previous.ticker.slice(1), previous.ticker[0] ?? ''] : [...previous.ticker];

  return {
    homeScore: previous.homeScore + homeScoreDelta,
    awayScore: previous.awayScore + awayScoreDelta,
    clock: nextClock,
    ticker: rotatedTicker,
  };
}

/**
 * React hook that seeds the data store with initial live data values and
 * periodically pushes mock updates.
 */
export function useLiveData(store: BroadsetDataStore, intervalMs: number = DEFAULT_UPDATE_INTERVAL_MS): void {
  const valuesRef = useRef(INITIAL_LIVE_DATA);

  useEffect(() => {
    valuesRef.current = INITIAL_LIVE_DATA;
    populateInitialData(store);

    const id = setInterval(() => {
      const next = simulateLiveUpdate(valuesRef.current);

      valuesRef.current = next;
      applyLiveUpdate(store, next);
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [store, intervalMs]);
}
