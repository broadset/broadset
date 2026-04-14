import type { BroadsetDocument } from '@broadset/model';
import { type JSX } from 'react';

import { DemoApp } from '../../src/DemoApp';

const STORAGE_DOCUMENT_KEY = 'broadset:demo-document:v1';
const STORAGE_SIDEBAR_KEY = 'broadset:demo-sidebar-preferences:v1';

export function DemoAppStored(props: { readonly document: BroadsetDocument }): JSX.Element {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_DOCUMENT_KEY, JSON.stringify(props.document));
    window.localStorage.removeItem(STORAGE_SIDEBAR_KEY);
  }

  return <DemoApp />;
}
