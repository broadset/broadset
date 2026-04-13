import type { DocumentChange } from '@broadset/model';

export type ChangeListener = (changes: readonly DocumentChange[]) => void;

export interface ChangeStream {
  readonly subscribe: (listener: ChangeListener) => () => void;
  readonly emit: (changes: readonly DocumentChange[]) => void;
  readonly suppress: () => void;
  readonly unsuppress: () => void;
}

export function createChangeStream(): ChangeStream {
  const listeners = new Set<ChangeListener>();
  let suppressed = false;

  return {
    subscribe(listener: ChangeListener): () => void {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    emit(changes: readonly DocumentChange[]): void {
      if (suppressed || changes.length === 0) {
        return;
      }

      for (const listener of listeners) {
        listener(changes);
      }
    },

    suppress(): void {
      suppressed = true;
    },

    unsuppress(): void {
      suppressed = false;
    },
  };
}
