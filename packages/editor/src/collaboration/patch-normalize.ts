import type { DocumentChange } from '@broadset/model';

export function normalizeChangePath(path: string): readonly string[] {
  return path.split('.');
}

export function normalizeRemoteChanges(changes: readonly DocumentChange[]): readonly DocumentChange[] {
  return [...changes];
}
