import { projectFormatV1 } from '@broadset/model';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ProjectEditorProvider, useProjectEditorStore } from './project-react-integration';
import { createProjectEditorStore } from './store-actions/project-store';

describe('project editor React integration', () => {
  it('provides the canonical v1 project store', () => {
    const store = createProjectEditorStore({ project: projectFormatV1.createProjectV1() });
    const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
      <ProjectEditorProvider store={store}>{children}</ProjectEditorProvider>
    );
    const { result } = renderHook(() => useProjectEditorStore(), { wrapper });

    expect(result.current).toBe(store);
  });

  it('fails fast outside the provider', () => {
    expect(() => renderHook(() => useProjectEditorStore())).toThrow(
      'useProjectEditorStore must be used inside a ProjectEditorProvider',
    );
  });
});
