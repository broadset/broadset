import { createContext, type ReactNode, useContext } from 'react';

import type { ProjectEditorStore } from './store-actions/project-store';

const ProjectEditorContext = createContext<ProjectEditorStore | null>(null);

export function ProjectEditorProvider({
  store,
  children,
}: {
  readonly store: ProjectEditorStore;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <ProjectEditorContext.Provider value={store}>{children}</ProjectEditorContext.Provider>;
}

export function useProjectEditorStore(): ProjectEditorStore {
  const store = useContext(ProjectEditorContext);

  if (store === null) throw new Error('useProjectEditorStore must be used inside a ProjectEditorProvider');

  return store;
}
