import type { EditorStore } from '@broadset/editor';
import { useSyncExternalStore } from 'react';

import { ELEMENT_TOOL_TYPES } from './constants';

export function useEditorSnapshot(store: EditorStore) {
  return useSyncExternalStore(
    (onStoreChange) =>
      store.subscribe(() => {
        onStoreChange();
      }),
    () => store.getState(),
    () => store.getState(),
  );
}

export function getElementLabel(type: string | null): string {
  if (type === null) {
    return 'Element';
  }

  return ELEMENT_TOOL_TYPES.find((entry) => entry.type === type)?.label ?? type;
}
