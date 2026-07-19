import { createProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { createKeyframePropertyAdapter } from './v1-keyframe-property-adapter';

function seededIds(store: ReturnType<typeof createProjectEditorStore>) {
  const sequence = store.getState().project.documents[0]?.sequences[0];
  const track = sequence?.tracks[0];
  const keyframe = track?.keyframes[0];

  if (sequence === undefined || track === undefined || keyframe === undefined) throw new Error('missing fixture');

  return { sequenceId: sequence.id, trackId: track.id, keyframeId: keyframe.id };
}

describe('createKeyframePropertyAdapter', () => {
  it('reads and writes the selected keyframe value through the invariant-safe command', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const ids = seededIds(store);
    const adapter = createKeyframePropertyAdapter({ store, ...ids });

    if (adapter === null) throw new Error('adapter should resolve');
    expect(adapter.target.pointer).toContain('/');
    expect(typeof adapter.getValue()).toBe('number');
    expect(adapter.updateValue(0.25)).toBe(true);

    const updated = store
      .getState()
      .project.documents[0]?.sequences[0]?.tracks[0]?.keyframes.find(({ id }) => id === ids.keyframeId);

    expect(updated?.value).toEqual({ type: 'number', value: 0.25 });
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('removes the addressed keyframe and returns null for stale ids', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const ids = seededIds(store);
    const adapter = createKeyframePropertyAdapter({ store, ...ids });

    expect(adapter?.removeKeyframe(ids.trackId, ids.keyframeId)).toBe(true);
    expect(createKeyframePropertyAdapter({ store, ...ids })).toBeNull();
  });
});
