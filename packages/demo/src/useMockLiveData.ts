import type { BroadsetDataStore } from '@broadset/editor';
import { createDataStore } from '@broadset/editor';
import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Live data element IDs (must match sampleDocument.ts)
// ---------------------------------------------------------------------------

const HOME_SCORE_ID = 'el-home-score';
const AWAY_SCORE_ID = 'el-away-score';
const CLOCK_ID = 'el-clock';
const TICKER_ID = 'el-ticker';

// ---------------------------------------------------------------------------
// Ticker headlines
// ---------------------------------------------------------------------------

const TICKER_HEADLINES = [
  'Breaking news: Welcome to the Broadset demo',
  'LIVE: Match underway — follow the action here',
  'Weather update: Clear skies expected tonight',
  'Stats: Home team leads possession 58%',
  'Reminder: Next match kicks off Saturday 15:00',
] as const;

// ---------------------------------------------------------------------------
// Helper: format clock seconds → MM:SS
// ---------------------------------------------------------------------------

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Hook: useMockLiveData
// ---------------------------------------------------------------------------

/** How often (ms) the mock data updates. */
const UPDATE_INTERVAL_MS = 1_000;

/**
 * Creates a BroadsetDataStore with initial placeholder values for live sports
 * data and runs a periodic timer that simulates live updates.
 *
 * Returns the store instance (stable across renders).
 */
export function useMockLiveData(): BroadsetDataStore {
  const storeRef = useRef<BroadsetDataStore | null>(null);

  if (storeRef.current === null) {
    storeRef.current = createDataStore({
      [HOME_SCORE_ID]: { text: '0' },
      [AWAY_SCORE_ID]: { text: '0' },
      [CLOCK_ID]: { text: '00:00' },
      [TICKER_ID]: { text: TICKER_HEADLINES[0] },
    });
  }

  const dataStore = storeRef.current;

  useEffect(() => {
    let clockSeconds = 0;
    let tickerIndex = 0;

    const timer = setInterval(() => {
      clockSeconds += 1;

      // Update clock every tick
      dataStore.getState().updateElementData(CLOCK_ID, { text: formatClock(clockSeconds) });

      // Randomly increment scores (~5 % chance per tick)
      if (Math.random() < 0.05) {
        const currentText = dataStore.getState().elements[HOME_SCORE_ID]?.['text'];
        const score = parseInt(typeof currentText === 'string' ? currentText : '0', 10) + 1;

        dataStore.getState().updateElementData(HOME_SCORE_ID, { text: String(score) });
      }

      if (Math.random() < 0.05) {
        const currentText = dataStore.getState().elements[AWAY_SCORE_ID]?.['text'];
        const score = parseInt(typeof currentText === 'string' ? currentText : '0', 10) + 1;

        dataStore.getState().updateElementData(AWAY_SCORE_ID, { text: String(score) });
      }

      // Cycle ticker every 5 seconds
      if (clockSeconds % 5 === 0) {
        tickerIndex = (tickerIndex + 1) % TICKER_HEADLINES.length;
        dataStore.getState().updateElementData(TICKER_ID, { text: TICKER_HEADLINES[tickerIndex] });
      }
    }, UPDATE_INTERVAL_MS);

    return (): void => {
      clearInterval(timer);
    };
  }, [dataStore]);

  return dataStore;
}
