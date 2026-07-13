import { projectFormatV1 } from '@broadset/model';
import { type JSX } from 'react';

import { DemoApp } from '../../src/DemoApp';

const STORAGE_PROJECT_KEY = 'broadset:project:v1';
const STORAGE_SIDEBAR_KEY = 'broadset:demo-sidebar-preferences:v1';

export function DemoAppStored(props: { readonly project: projectFormatV1.BroadsetProjectV1 }): JSX.Element {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_PROJECT_KEY, projectFormatV1.canonicalizeProjectV1(props.project));
    window.localStorage.removeItem(STORAGE_SIDEBAR_KEY);
  }

  return <DemoApp />;
}
