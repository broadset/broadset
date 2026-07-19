import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { clearLifecycleInProject, setLifecyclePhaseActionsInProject } from './project-v1-lifecycle-mutations';
import { addSequenceInProject, createSequenceV1 } from './project-v1-sequence-mutations';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function idFactory(): () => projectFormatV1.Id {
  let next = 0;

  return () => id(`lc-${String(next++)}`);
}

/** Motion document with one element and one page-root instance, ready for animation authoring. */
function createMotionProject(): projectFormatV1.BroadsetProjectV1 {
  const element = projectFormatV1.createElementV1({
    id: id('headline'),
    name: 'Headline',
    geometry: projectFormatV1.createElementGeometry({ width: 200, height: 80 }),
    kind: 'vector',
    geometryData: projectFormatV1.createRectangleGeometry(),
  });
  const page = projectFormatV1.createPageV1({
    id: id('page-1'),
    rootInstances: [{ id: id('root-1'), elementId: element.id, overrides: [], componentPropertyValues: [] }],
  });
  const document = projectFormatV1.createDocumentV1({
    id: id('doc-1'),
    kind: 'motion',
    timebase: {
      frameRate: { numerator: 30, denominator: 1 },
      ticksPerSecond: 30,
      timecode: { nominalFramesPerSecond: 30, dropFrame: false },
    },
    elements: [element],
    pages: [page],
  });

  return projectFormatV1.createProjectV1({ documents: [document] });
}

function baseProject(): projectFormatV1.BroadsetProjectV1 {
  return addSequenceInProject({
    project: createMotionProject(),
    documentId: id('doc-1'),
    sequence: createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 }),
  });
}

describe('lifecycle mutations', () => {
  it('creates the lifecycle on first phase write and stores the actions in the fixed slot', () => {
    const next = setLifecyclePhaseActionsInProject({
      project: baseProject(),
      documentId: id('doc-1'),
      phase: 'in',
      actions: [{ kind: 'play-sequence', sequenceId: id('seq-1'), behavior: 'restart' }],
      createId: idFactory(),
    });
    const lifecycle = next.documents[0]?.lifecycle;

    expect(lifecycle?.in).toEqual([{ kind: 'play-sequence', sequenceId: id('seq-1'), behavior: 'restart' }]);
    expect(lifecycle?.hold).toEqual([]);
    expect(lifecycle?.out).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(next)).toEqual([]);
  });

  it('rejects actions that reference an unknown sequence', () => {
    const project = baseProject();
    const next = setLifecyclePhaseActionsInProject({
      project,
      documentId: id('doc-1'),
      phase: 'out',
      actions: [{ kind: 'play-sequence', sequenceId: id('missing'), behavior: 'restart' }],
      createId: idFactory(),
    });

    expect(next).toBe(project);
  });

  it('drops an all-empty lifecycle instead of serializing empty slots', () => {
    const withIn = setLifecyclePhaseActionsInProject({
      project: baseProject(),
      documentId: id('doc-1'),
      phase: 'in',
      actions: [{ kind: 'play-sequence', sequenceId: id('seq-1'), behavior: 'restart' }],
      createId: idFactory(),
    });
    const emptied = setLifecyclePhaseActionsInProject({
      project: withIn,
      documentId: id('doc-1'),
      phase: 'in',
      actions: [],
      createId: idFactory(),
    });

    expect(emptied.documents[0]?.lifecycle).toBeUndefined();

    const cleared = clearLifecycleInProject({ project: withIn, documentId: id('doc-1') });

    expect(cleared.documents[0]?.lifecycle).toBeUndefined();
  });
});
