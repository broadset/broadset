import type { projectFormatV1 } from '@broadset/model';
import type { StoreApi } from 'zustand/vanilla';

import type { ProjectEditorState } from './project-store';

export interface ProjectEditorPlaybackState {
  readonly playbackSequenceId: projectFormatV1.Id | null;
  readonly playbackTick: number;
  readonly playbackPlaying: boolean;
  readonly setPlaybackSequence: (sequenceId: projectFormatV1.Id | null) => boolean;
  readonly seekPlaybackTick: (tick: number) => boolean;
  readonly setPlaybackPlaying: (playing: boolean) => boolean;
  readonly resetPlayback: () => void;
}

export function resolvePreviewSequenceId(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
}): projectFormatV1.Id | null {
  const document = options.project.documents.find(({ id }) => id === options.documentId);
  const page = document?.pages.find(({ id }) => id === options.pageId);

  return page?.sequenceId ?? document?.sequences[0]?.id ?? null;
}

function selectedSequence(state: ProjectEditorState): projectFormatV1.Sequence | undefined {
  const document = state.project.documents.find(({ id }) => id === state.activeDocumentId);

  return document?.sequences.find(({ id }) => id === state.playbackSequenceId);
}

export function createProjectEditorPlaybackState(
  store: Pick<StoreApi<ProjectEditorState>, 'getState' | 'setState'>,
  initialSequenceId: projectFormatV1.Id | null,
): ProjectEditorPlaybackState {
  return {
    playbackSequenceId: initialSequenceId,
    playbackTick: 0,
    playbackPlaying: false,
    setPlaybackSequence(sequenceId: projectFormatV1.Id | null): boolean {
      if (sequenceId !== null) {
        const state = store.getState();
        const document = state.project.documents.find(({ id }) => id === state.activeDocumentId);

        if (document?.sequences.some(({ id }) => id === sequenceId) !== true) return false;
      }

      store.setState({ playbackSequenceId: sequenceId, playbackTick: 0, playbackPlaying: false });

      return true;
    },
    seekPlaybackTick(tick: number): boolean {
      if (!Number.isSafeInteger(tick) || tick < 0) return false;

      const sequence = selectedSequence(store.getState());

      if (sequence === undefined) return false;

      store.setState({ playbackTick: Math.min(tick, sequence.durationTicks) });

      return true;
    },
    setPlaybackPlaying(playing: boolean): boolean {
      const sequence = selectedSequence(store.getState());

      if (sequence === undefined || (playing && sequence.durationTicks === 0)) return false;

      store.setState({ playbackPlaying: playing });

      return true;
    },
    resetPlayback(): void {
      store.setState({ playbackTick: 0, playbackPlaying: false });
    },
  };
}
