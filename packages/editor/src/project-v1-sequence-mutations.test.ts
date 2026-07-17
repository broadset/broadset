import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import {
  addKeyframeInProject,
  addSequenceInProject,
  createKeyframeV1,
  createSequenceV1,
  createTrackInProject,
  createTrackV1,
  removeKeyframeInProject,
  removeSequenceInProject,
  updateKeyframeInProject,
} from './project-v1-sequence-mutations';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function idFactory(): () => projectFormatV1.Id {
  let next = 0;

  return () => id(`seq-gen-${String(next++)}`);
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

const OPACITY_TARGET: projectFormatV1.PropertyTarget = {
  entity: { projectId: id('project'), documentId: id('doc-1'), entityKind: 'element', entityId: id('headline') },
  pointer: '/appearance/opacity',
};

function numberValue(value: number): projectFormatV1.TypedValue {
  return { type: 'number', value };
}

function activeDocument(project: projectFormatV1.BroadsetProjectV1): projectFormatV1.BroadsetDocumentV1 {
  const document = project.documents[0];

  if (document === undefined) throw new Error('Expected a document');

  return document;
}

function firstTrack(project: projectFormatV1.BroadsetProjectV1): projectFormatV1.Track {
  const track = activeDocument(project).sequences[0]?.tracks[0];

  if (track === undefined) throw new Error('Expected a track');

  return track;
}

function isValid(project: projectFormatV1.BroadsetProjectV1): boolean {
  return projectFormatV1.validateBroadsetProjectV1Semantics(project).length === 0;
}

describe('v1 sequence authoring transforms', () => {
  it('adds a sequence to the active document and stays semantically valid', () => {
    const project = createMotionProject();
    const sequence = createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 });
    const next = addSequenceInProject({ project, documentId: id('doc-1'), sequence });

    expect(activeDocument(next).sequences.map(({ id: sequenceId }) => sequenceId)).toEqual([id('seq-1')]);
    expect(isValid(next)).toBe(true);
  });

  it('creates a track with a seed keyframe and appends further keyframes in tick order', () => {
    const createId = idFactory();
    const base = addSequenceInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      sequence: createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 }),
    });
    const track = createTrackV1({
      id: createId(),
      name: 'Opacity',
      target: OPACITY_TARGET,
      valueType: 'number',
      keyframes: [createKeyframeV1({ id: createId(), tick: 30, value: numberValue(1) })],
    });
    const withTrack = createTrackInProject({ project: base, documentId: id('doc-1'), sequenceId: id('seq-1'), track });

    const withKeyframe = addKeyframeInProject({
      project: withTrack,
      documentId: id('doc-1'),
      sequenceId: id('seq-1'),
      trackId: track.id,
      keyframe: createKeyframeV1({ id: createId(), tick: 0, value: numberValue(0) }),
    });

    const ticks = firstTrack(withKeyframe).keyframes.map(({ tick }) => tick);

    expect(ticks).toEqual([0, 30]);
    expect(isValid(withKeyframe)).toBe(true);
  });

  it('keeps the interpolation invariant: only the final keyframe has no outgoing interpolation', () => {
    const createId = idFactory();
    const base = addSequenceInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      sequence: createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 }),
    });
    const track = createTrackV1({
      id: createId(),
      name: 'Opacity',
      target: OPACITY_TARGET,
      valueType: 'number',
      keyframes: [createKeyframeV1({ id: createId(), tick: 0, value: numberValue(0) })],
    });
    const withTrack = createTrackInProject({ project: base, documentId: id('doc-1'), sequenceId: id('seq-1'), track });
    const next = addKeyframeInProject({
      project: withTrack,
      documentId: id('doc-1'),
      sequenceId: id('seq-1'),
      trackId: track.id,
      keyframe: createKeyframeV1({ id: createId(), tick: 30, value: numberValue(1) }),
    });

    const keyframes = firstTrack(next).keyframes;

    expect(keyframes[0]?.interpolation).toBeDefined();
    expect(keyframes[keyframes.length - 1]?.interpolation).toBeUndefined();
    expect(isValid(next)).toBe(true);
  });

  it('updates a keyframe value in place', () => {
    const createId = idFactory();
    const base = addSequenceInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      sequence: createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 }),
    });
    const keyframeId = createId();
    const track = createTrackV1({
      id: createId(),
      name: 'Opacity',
      target: OPACITY_TARGET,
      valueType: 'number',
      keyframes: [createKeyframeV1({ id: keyframeId, tick: 0, value: numberValue(0) })],
    });
    const withTrack = createTrackInProject({ project: base, documentId: id('doc-1'), sequenceId: id('seq-1'), track });
    const next = updateKeyframeInProject({
      project: withTrack,
      documentId: id('doc-1'),
      sequenceId: id('seq-1'),
      trackId: track.id,
      keyframeId,
      update: { value: numberValue(0.5) },
    });

    expect(firstTrack(next).keyframes[0]?.value).toEqual(numberValue(0.5));
    expect(isValid(next)).toBe(true);
  });

  it('removes the owning track when its last keyframe is removed', () => {
    const createId = idFactory();
    const base = addSequenceInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      sequence: createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 }),
    });
    const keyframeId = createId();
    const track = createTrackV1({
      id: createId(),
      name: 'Opacity',
      target: OPACITY_TARGET,
      valueType: 'number',
      keyframes: [createKeyframeV1({ id: keyframeId, tick: 0, value: numberValue(0) })],
    });
    const withTrack = createTrackInProject({ project: base, documentId: id('doc-1'), sequenceId: id('seq-1'), track });
    const next = removeKeyframeInProject({
      project: withTrack,
      documentId: id('doc-1'),
      sequenceId: id('seq-1'),
      trackId: track.id,
      keyframeId,
    });

    expect(activeDocument(next).sequences[0]?.tracks).toEqual([]);
    expect(isValid(next)).toBe(true);
  });

  it('removes a sequence and clears the page reference that pointed at it', () => {
    const base = addSequenceInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      sequence: createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 }),
    });
    const referenced: projectFormatV1.BroadsetProjectV1 = {
      ...base,
      documents: base.documents.map((document) => ({
        ...document,
        pages: document.pages.map((page) => ({ ...page, sequenceId: id('seq-1') })),
      })),
    };

    const next = removeSequenceInProject({ project: referenced, documentId: id('doc-1'), sequenceId: id('seq-1') });

    expect(activeDocument(next).sequences).toEqual([]);
    expect(activeDocument(next).pages[0]?.sequenceId).toBeUndefined();
    expect(isValid(next)).toBe(true);
  });
});
