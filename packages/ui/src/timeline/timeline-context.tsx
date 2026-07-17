import type { JSX, ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

export interface TimelineOwnerAddress {
  readonly documentId: string;
  readonly componentId?: string | undefined;
}

export interface TimelineEditingTarget {
  readonly owner: TimelineOwnerAddress;
  readonly sequenceId: string;
  readonly trackId: string | null;
}

export interface TimelineEditingContextValue {
  readonly target: TimelineEditingTarget | null;
  readonly openSequence: (owner: TimelineOwnerAddress, sequenceId: string, trackId: string | null) => void;
  readonly closeSequence: () => void;
}

const TimelineEditingContext = createContext<TimelineEditingContextValue | null>(null);

/** Runtime-only editing target; no field here is ever serialized (timeline.md MUST). */
export function TimelineEditingProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [target, setTarget] = useState<TimelineEditingTarget | null>(null);
  const value = useMemo<TimelineEditingContextValue>(
    () => ({
      target,
      openSequence(owner, sequenceId, trackId): void {
        setTarget({ owner, sequenceId, trackId });
      },
      closeSequence(): void {
        setTarget(null);
      },
    }),
    [target],
  );

  return <TimelineEditingContext.Provider value={value}>{children}</TimelineEditingContext.Provider>;
}

export function useTimelineEditing(): TimelineEditingContextValue | null {
  return useContext(TimelineEditingContext);
}
