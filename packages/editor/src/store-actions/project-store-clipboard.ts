import type { projectFormatV1 } from '@broadset/model';
import type { StoreApi } from 'zustand/vanilla';

import { createElementClipboardPayloadV1, pasteElementClipboardPayloadV1 } from '../project-v1-clipboard';
import type { ProjectEditorState } from './project-store';
import { firstInstanceAddressForElement } from './project-store-selection';

const BROADSET_ELEMENTS_MIME = 'application/x-broadset-elements';

function isClipboard(input: unknown): input is Clipboard {
  return (
    typeof input === 'object' &&
    input !== null &&
    typeof Reflect.get(input, 'write') === 'function' &&
    typeof Reflect.get(input, 'read') === 'function' &&
    typeof Reflect.get(input, 'writeText') === 'function' &&
    typeof Reflect.get(input, 'readText') === 'function'
  );
}

function getBrowserClipboard(): Clipboard | null {
  const navigatorValue: unknown = Reflect.get(globalThis, 'navigator');
  const clipboardValue: unknown =
    typeof navigatorValue === 'object' && navigatorValue !== null ? Reflect.get(navigatorValue, 'clipboard') : null;

  return isClipboard(clipboardValue) ? clipboardValue : null;
}

function isClipboardItem(input: unknown): input is ClipboardItem {
  return (
    typeof input === 'object' &&
    input !== null &&
    Array.isArray(Reflect.get(input, 'types')) &&
    typeof Reflect.get(input, 'getType') === 'function'
  );
}

function createBrowserClipboardItem(payload: string): ClipboardItem | null {
  const constructor: unknown = Reflect.get(globalThis, 'ClipboardItem');

  if (typeof constructor !== 'function') return null;

  try {
    const candidate: unknown = Reflect.construct(constructor, [
      {
        [BROADSET_ELEMENTS_MIME]: new Blob([payload], { type: BROADSET_ELEMENTS_MIME }),
        'text/plain': new Blob([payload], { type: 'text/plain' }),
      },
    ]);

    return isClipboardItem(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export interface ProjectClipboardPortV1 {
  readonly write: (payload: string) => Promise<boolean>;
  readonly read: () => Promise<string | null>;
}

export interface ProjectEditorClipboardState {
  readonly hasInternalClipboard: boolean;
  readonly copySelection: () => Promise<boolean>;
  readonly cutSelection: () => Promise<boolean>;
  readonly pasteClipboard: () => Promise<boolean>;
  readonly duplicateSelection: () => Promise<boolean>;
  readonly clearClipboard: () => void;
}

function browserClipboardPort(): ProjectClipboardPortV1 {
  return {
    async write(payload: string): Promise<boolean> {
      const clipboard = getBrowserClipboard();

      if (clipboard === null) return false;

      try {
        const item = createBrowserClipboardItem(payload);

        if (item !== null) {
          await clipboard.write([item]);

          return true;
        }

        await clipboard.writeText(payload);

        return true;
      } catch {
        try {
          await clipboard.writeText(payload);

          return true;
        } catch {
          return false;
        }
      }
    },
    async read(): Promise<string | null> {
      const clipboard = getBrowserClipboard();

      if (clipboard === null) return null;

      try {
        const items = await clipboard.read();

        for (const item of items) {
          if (item.types.includes(BROADSET_ELEMENTS_MIME)) {
            return await (await item.getType(BROADSET_ELEMENTS_MIME)).text();
          }
        }

        return await clipboard.readText();
      } catch {
        return null;
      }
    },
  };
}

export function createProjectEditorClipboardState(
  store: Pick<StoreApi<ProjectEditorState>, 'getState' | 'setState'>,
  options: {
    readonly createId: () => projectFormatV1.Id;
    readonly port?: ProjectClipboardPortV1 | undefined;
  },
): ProjectEditorClipboardState {
  let internalPayload: string | null = null;
  const port = options.port ?? browserClipboardPort();

  return {
    hasInternalClipboard: false,
    async copySelection(): Promise<boolean> {
      const state = store.getState();
      const document = state.project.documents.find(({ id }) => id === state.activeDocumentId);
      const selectedElementIds = [...new Set(state.activeInstanceAddresses.map(({ elementId }) => elementId))];
      const payload =
        document === undefined ? null : createElementClipboardPayloadV1({ document, selectedElementIds });

      if (payload === null) return false;

      internalPayload = payload;
      store.setState({ hasInternalClipboard: true });
      await port.write(payload);

      return true;
    },
    async cutSelection(): Promise<boolean> {
      const state = store.getState();
      const selectedElementIds = [...new Set(state.activeInstanceAddresses.map(({ elementId }) => elementId))];

      if (!(await state.copySelection())) return false;

      store.getState().removeElements(selectedElementIds);

      return true;
    },
    async pasteClipboard(): Promise<boolean> {
      const systemPayload = await port.read();
      const payloads = systemPayload === null ? [internalPayload] : [systemPayload, internalPayload];

      for (const payload of payloads) {
        if (payload === null) continue;

        const state = store.getState();
        const result = pasteElementClipboardPayloadV1({
          project: state.project,
          documentId: state.activeDocumentId,
          pageId: state.activePageId,
          payload,
          createId: options.createId,
        });

        if (result === null) continue;

        store.setState({
          project: result.project,
          activeInstanceAddresses: result.rootElementIds.flatMap((elementId) => {
            const address = firstInstanceAddressForElement({ ...state, project: result.project }, elementId);

            return address === undefined ? [] : [address];
          }),
        });

        return true;
      }

      return false;
    },
    async duplicateSelection(): Promise<boolean> {
      return (await store.getState().copySelection()) && (await store.getState().pasteClipboard());
    },
    clearClipboard(): void {
      internalPayload = null;
      store.setState({ hasInternalClipboard: false });
    },
  };
}
