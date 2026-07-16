import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1DataSidebar } from './v1-data-sidebar';

describe('V1DataSidebar', () => {
  it('writes typed sample data through the invariant-safe v1 document mutation', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1DataSidebar editorStore={store} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Home Score' }), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Show Stats Panel' }));

    await waitFor(() => {
      const values = store.getState().project.documents[0]?.viewModels[0]?.sampleDataSets[0]?.values;

      expect(values?.[projectFormatV1.idSchema.parse('field-homeScore')]).toEqual({ type: 'string', value: '3' });
      expect(values?.[projectFormatV1.idSchema.parse('field-showStats')]).toEqual({ type: 'boolean', value: false });
    });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
