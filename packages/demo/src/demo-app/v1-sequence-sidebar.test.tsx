import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1SequenceSidebar } from './v1-sequence-sidebar';

describe('V1SequenceSidebar', () => {
  it('writes sequence metadata through the invariant-safe v1 document mutation', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    const nameInput = screen.getByRole('textbox', { name: 'Sequence name' });
    const durationInput = screen.getByRole('spinbutton', { name: 'Duration ticks' });
    const secondKeyframeInput = screen.getByRole('spinbutton', {
      name: 'Live Pulse opacity keyframe 2 tick',
    });

    fireEvent.change(nameInput, { target: { value: 'Renamed live pulse' } });
    fireEvent.change(durationInput, { target: { value: '900' } });
    fireEvent.change(secondKeyframeInput, { target: { value: '850' } });

    await waitFor(() => {
      const sequence = store.getState().project.documents[0]?.sequences[0];

      expect(sequence?.name).toBe('Renamed live pulse');
      expect(sequence?.durationTicks).toBe(900);
      expect(sequence?.tracks[0]?.keyframes[1]?.tick).toBe(850);
    });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
