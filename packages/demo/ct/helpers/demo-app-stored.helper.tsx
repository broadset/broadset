import type { projectFormatV1 } from '@broadset/model';
import { type JSX, useEffect, useState } from 'react';

import { DemoApp } from '../../src/DemoApp';
import { SAMPLE_PROJECT_BLOBS_V1 } from '../../src/sample-project-v1';
import { saveStoredProjectV1 } from '../../src/v1-project-persistence';

const STORAGE_PROJECT_KEY = 'broadset:project:v1';
const STORAGE_SIDEBAR_KEY = 'broadset:demo-sidebar-preferences:v1';

export function DemoAppStored(props: { readonly project: projectFormatV1.BroadsetProjectV1 }): JSX.Element {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    window.localStorage.removeItem(STORAGE_SIDEBAR_KEY);
    void saveStoredProjectV1({
      storage: window.localStorage,
      storageKey: STORAGE_PROJECT_KEY,
      project: props.project,
      blobs: SAMPLE_PROJECT_BLOBS_V1,
    }).then((saved) => {
      if (active && saved) setReady(true);
    });

    return () => {
      active = false;
    };
  }, [props.project]);

  return ready ? <DemoApp /> : <div aria-label="Preparing native project" />;
}
