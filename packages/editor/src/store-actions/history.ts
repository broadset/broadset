import type { BroadsetDocument } from '@broadset/model';

import type { NamedSnapshot } from './store';

export const MAX_SNAPSHOTS = 20;

export function ensureSnapshotName(name: string): string {
  const trimmed = name.trim();

  if (trimmed === '') {
    throw new Error('Snapshot name must be a non-empty string');
  }

  return trimmed;
}

export function createSnapshot(name: string, document: BroadsetDocument): NamedSnapshot {
  return {
    id: crypto.randomUUID(),
    name,
    timestamp: new Date().toISOString(),
    document: structuredClone(document),
  };
}
