import { type JSX } from 'react';

import { DemoApp } from '../../src/DemoApp';

const STORAGE_KEYS_TO_CLEAR: readonly string[] = ['broadset:demo-document:v1', 'broadset:demo-sidebar-preferences:v1'];

export function DemoAppFresh(): JSX.Element {
  if (typeof window !== 'undefined') {
    for (const storageKey of STORAGE_KEYS_TO_CLEAR) {
      window.localStorage.removeItem(storageKey);
    }
  }

  return <DemoApp />;
}
