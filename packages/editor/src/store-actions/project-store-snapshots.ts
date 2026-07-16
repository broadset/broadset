import type { projectFormatV1 } from '@broadset/model';
import type { StoreApi } from 'zustand/vanilla';

import type { ProjectEditorState } from './project-store';
import { isValidProject } from './project-store-mutations';

const MAX_PROJECT_SNAPSHOTS = 20;

export interface NamedProjectSnapshotV1 {
  readonly id: projectFormatV1.Id;
  readonly name: string;
  readonly createdAt: string;
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
}

export interface ProjectEditorSnapshotState {
  readonly snapshots: readonly NamedProjectSnapshotV1[];
  readonly createSnapshot: (name: string) => projectFormatV1.Id | null;
  readonly restoreSnapshot: (snapshotId: projectFormatV1.Id) => boolean;
  readonly renameSnapshot: (snapshotId: projectFormatV1.Id, name: string) => boolean;
  readonly deleteSnapshot: (snapshotId: projectFormatV1.Id) => boolean;
}

interface SnapshotActionOptions {
  readonly createId: () => projectFormatV1.Id;
  readonly now: () => string;
}

function cloneBlobs(
  blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>,
): ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> {
  return new Map([...blobs].map(([digest, bytes]) => [digest, bytes.slice()]));
}

function cloneProject(
  project: projectFormatV1.BroadsetProjectV1,
): projectFormatV1.BroadsetProjectV1 | null {
  try {
    const clone = structuredClone(project);

    return isValidProject(clone) ? clone : null;
  } catch {
    return null;
  }
}

export function createProjectEditorSnapshotState(
  set: StoreApi<ProjectEditorState>['setState'],
  options: SnapshotActionOptions,
): ProjectEditorSnapshotState {
  return {
    snapshots: [],
    createSnapshot(name: string): projectFormatV1.Id | null {
      const normalized = name.trim();
      let snapshotId: projectFormatV1.Id | null = null;

      set((state) => {
        if (
          normalized === '' ||
          state.snapshots.length >= MAX_PROJECT_SNAPSHOTS ||
          state.snapshots.some((snapshot) => snapshot.name === normalized)
        ) {
          return {};
        }

        const project = cloneProject(state.project);

        if (project === null) return {};

        snapshotId = options.createId();

        return {
          snapshots: [
            ...state.snapshots,
            {
              id: snapshotId,
              name: normalized,
              createdAt: options.now(),
              project,
              blobs: cloneBlobs(state.blobs),
            },
          ],
        };
      });

      return snapshotId;
    },
    restoreSnapshot(snapshotId: projectFormatV1.Id): boolean {
      let restored = false;

      set((state) => {
        const snapshot = state.snapshots.find(({ id }) => id === snapshotId);

        if (snapshot === undefined) return {};

        const project = cloneProject(snapshot.project);
        const document = project?.documents[0];
        const page = document?.pages[0];

        if (project === null || document === undefined || page === undefined) return {};

        restored = true;

        return {
          project,
          blobs: cloneBlobs(snapshot.blobs),
          activeDocumentId: document.id,
          activePageId: page.id,
          activeInstanceAddresses: [],
        };
      });

      return restored;
    },
    renameSnapshot(snapshotId: projectFormatV1.Id, name: string): boolean {
      const normalized = name.trim();
      let renamed = false;

      set((state) => {
        if (
          normalized === '' ||
          state.snapshots.some((snapshot) => snapshot.id !== snapshotId && snapshot.name === normalized)
        ) {
          return {};
        }

        if (!state.snapshots.some(({ id }) => id === snapshotId)) return {};

        renamed = true;

        return {
          snapshots: state.snapshots.map((snapshot) =>
            snapshot.id === snapshotId ? { ...snapshot, name: normalized } : snapshot,
          ),
        };
      });

      return renamed;
    },
    deleteSnapshot(snapshotId: projectFormatV1.Id): boolean {
      let deleted = false;

      set((state) => {
        const snapshots = state.snapshots.filter(({ id }) => id !== snapshotId);

        if (snapshots.length === state.snapshots.length) return {};

        deleted = true;

        return { snapshots };
      });

      return deleted;
    },
  };
}
