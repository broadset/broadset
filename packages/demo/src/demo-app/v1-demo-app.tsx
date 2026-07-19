import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { useCallback, useMemo } from 'react';

import { DEMO_EDITOR_CONFIG } from '../demoConfig';
import { SAMPLE_PROJECT_BLOBS_V1, SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1DemoWorkspace } from './v1-demo-workspace';

const PROJECT_STORAGE_KEY = 'broadset:project:v1';
const INITIAL_ELEMENT_ID = projectFormatV1.idSchema.parse('el-sb-home-score');

declare global {
  interface Window {
    readonly __broadsetProjectEditorStore?: ProjectEditorStore | undefined;
  }
}

export function V1DemoApp(): React.JSX.Element {
  const persistence = useMemo(
    (): { readonly storage: Storage; readonly storageKey: string } => ({
      storage: window.localStorage,
      storageKey: PROJECT_STORAGE_KEY,
    }),
    [],
  );
  const exposeStore = useCallback((store: ProjectEditorStore): void => {
    Object.defineProperty(window, '__broadsetProjectEditorStore', {
      configurable: true,
      value: store,
    });
  }, []);

  return (
    <div data-testid="demo-shell" style={{ height: '100%', minHeight: 0, width: '100%' }}>
      <V1DemoWorkspace
        blobs={SAMPLE_PROJECT_BLOBS_V1}
        config={DEMO_EDITOR_CONFIG}
        initialElementId={INITIAL_ELEMENT_ID}
        persistence={persistence}
        project={SAMPLE_PROJECT_V1}
        onStoreReady={exposeStore}
      />
    </div>
  );
}
