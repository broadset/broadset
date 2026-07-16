import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createProjectEditorStore } from './project-store';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function createProject(name = 'Snapshot source'): projectFormatV1.BroadsetProjectV1 {
  const element = projectFormatV1.createElementV1({
    id: id('snapshot-element'),
    name,
    geometry: projectFormatV1.createElementGeometry({ width: 100, height: 100 }),
    kind: 'vector',
    geometryData: projectFormatV1.createRectangleGeometry(),
  });
  const page = projectFormatV1.createPageV1({
    id: id('snapshot-page'),
    rootInstances: [
      {
        id: id('snapshot-instance'),
        elementId: element.id,
        overrides: [],
        componentPropertyValues: [],
      },
    ],
  });
  const document = projectFormatV1.createDocumentV1({ id: id('snapshot-document'), elements: [element], pages: [page] });

  return projectFormatV1.createProjectV1({ documents: [document] });
}

describe('project v1 named snapshots', () => {
  it('deep-clones snapshots, restores them as an undoable project replacement, and keeps them outside project JSON', () => {
    const store = createProjectEditorStore({ project: createProject(), now: () => '2026-07-15T20:00:00.000Z' });
    const snapshotId = store.getState().createSnapshot('Before edit');

    expect(snapshotId).not.toBeNull();
    expect(store.getState().snapshots).toEqual([
      expect.objectContaining({ id: snapshotId, name: 'Before edit', createdAt: '2026-07-15T20:00:00.000Z' }),
    ]);
    expect(store.getState().snapshots[0]?.project).not.toBe(store.getState().project);
    expect(projectFormatV1.canonicalizeProjectV1(store.getState().project)).not.toContain('snapshots');

    store.getState().updateElement(id('snapshot-element'), (element) => ({ ...element, name: 'Edited' }));
    expect(store.getState().restoreSnapshot(snapshotId ?? id('missing'))).toBe(true);
    expect(store.getState().project.documents[0]?.elements[0]?.name).toBe('Snapshot source');

    store.getState().undo();
    expect(store.getState().project.documents[0]?.elements[0]?.name).toBe('Edited');
  });

  it('enforces non-empty unique names and the 20-snapshot limit, then supports rename and delete', () => {
    let nextId = 0;
    const store = createProjectEditorStore({
      project: createProject(),
      createId: () => id(`snapshot-${String(nextId++)}`),
      now: () => '2026-07-15T20:00:00.000Z',
    });

    expect(store.getState().createSnapshot(' ')).toBeNull();
    expect(store.getState().createSnapshot('Checkpoint')).not.toBeNull();
    expect(store.getState().createSnapshot('Checkpoint')).toBeNull();

    for (let index = 1; index < 20; index += 1) {
      expect(store.getState().createSnapshot(`Checkpoint ${String(index)}`)).not.toBeNull();
    }

    expect(store.getState().createSnapshot('Overflow')).toBeNull();

    const firstId = store.getState().snapshots[0]?.id ?? id('missing');

    expect(store.getState().renameSnapshot(firstId, 'Renamed')).toBe(true);
    expect(store.getState().renameSnapshot(firstId, 'Checkpoint 1')).toBe(false);
    expect(store.getState().deleteSnapshot(firstId)).toBe(true);
    expect(store.getState().snapshots).toHaveLength(19);
  });
});
