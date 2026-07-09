import { createContext, type JSX, type ReactNode, useCallback, useContext, useState } from 'react';

export interface TimelineTarget {
  readonly elementId: string;
  readonly timelineName: string;
}

export interface TimelineEditingContextValue {
  readonly target: TimelineTarget | null;
  readonly snapshot: ReadonlyMap<string, unknown> | null;
  readonly openTimeline: (elementId: string, timelineName: string, snapshot: ReadonlyMap<string, unknown>) => void;
  readonly closeTimeline: () => void;
}

const TimelineEditingContext = createContext<TimelineEditingContextValue | null>(null);

export function useTimelineEditing(): TimelineEditingContextValue | null {
  return useContext(TimelineEditingContext);
}

export function TimelineEditingProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [target, setTarget] = useState<TimelineTarget | null>(null);
  const [snapshot, setSnapshot] = useState<ReadonlyMap<string, unknown> | null>(null);

  const openTimeline = useCallback(
    (elementId: string, timelineName: string, nextSnapshot: ReadonlyMap<string, unknown>): void => {
      setTarget({ elementId, timelineName });
      setSnapshot(nextSnapshot);
    },
    [],
  );

  const closeTimeline = useCallback((): void => {
    setTarget(null);
    setSnapshot(null);
  }, []);

  return (
    <TimelineEditingContext.Provider value={{ closeTimeline, openTimeline, snapshot, target }}>
      {children}
    </TimelineEditingContext.Provider>
  );
}
