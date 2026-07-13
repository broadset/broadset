import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1ElementSidebar } from './v1-element-sidebar';

describe('V1ElementSidebar', () => {
  it('reads and writes the selected v1 element through the project store', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const elementId = projectFormatV1.idSchema.parse('el-sb-home-score');

    store.getState().selectElement(elementId);
    render(<V1ElementSidebar editorStore={store} tab="properties" />);

    const nameInput = screen.getByRole('textbox', { name: 'Element name' });

    if (!(nameInput instanceof HTMLInputElement)) throw new Error('Expected element name input');

    expect(nameInput.value).toBe('Home Score');
    fireEvent.change(nameInput, { target: { value: 'Updated Score' } });
    fireEvent.blur(nameInput);

    const element = store.getState().project.documents[0]?.elements.find((candidate) => candidate.id === elementId);

    expect(element?.name).toBe('Updated Score');
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
