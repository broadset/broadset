import { type TimelineOwnerAddress, useTimelineEditing } from '@broadset/ui';
import type { ReactNode } from 'react';

/** Timeline open/close API derived from the ambient `TimelineEditingProvider` target. */
interface TimelineOpenBridgeApi {
  readonly timelineOpen: boolean;
  readonly openTimeline: (owner: TimelineOwnerAddress, sequenceId: string) => void;
  readonly closeTimeline: () => void;
}

interface TimelineOpenBridgeProps {
  readonly children: (api: TimelineOpenBridgeApi) => ReactNode;
}

/**
 * Bridges `useTimelineEditing()` into a render-prop so the workspace body keeps deriving
 * `timelineOpen` from the sequence/track editing target instead of a parallel ad-hoc boolean,
 * without hoisting the entire workspace render tree's local state into a second component.
 */
export function TimelineOpenBridge({ children }: TimelineOpenBridgeProps): React.JSX.Element {
  const timelineEditing = useTimelineEditing();
  const api: TimelineOpenBridgeApi = {
    timelineOpen: (timelineEditing?.target ?? null) !== null,
    openTimeline(owner, sequenceId) {
      timelineEditing?.openSequence(owner, sequenceId, null);
    },
    closeTimeline() {
      timelineEditing?.closeSequence();
    },
  };

  return <>{children(api)}</>;
}
