import type { projectFormatV1 } from '@broadset/model';

import { isValidProject } from './store-actions/project-store-mutations';

type Project = projectFormatV1.BroadsetProjectV1;
type Document = projectFormatV1.BroadsetDocumentV1;
type Sequence = projectFormatV1.Sequence;
type Track = projectFormatV1.Track;
type Keyframe = projectFormatV1.Keyframe;
type Id = projectFormatV1.Id;

/**
 * Default outgoing interpolation for a segment that gains a following keyframe. `hold` is
 * type-compatible with every value kind, so promoting a former final keyframe never produces an
 * invalid track; the author can refine it afterward.
 */
const DEFAULT_SEGMENT_INTERPOLATION: projectFormatV1.Interpolation = { kind: 'hold' };

/**
 * Enforce the track invariants the model validator requires: keyframes ordered by tick, every
 * non-final keyframe carries an outgoing interpolation, and the final keyframe carries none.
 */
function normalizeTrackKeyframes(keyframes: readonly Keyframe[]): readonly Keyframe[] {
  const ordered = [...keyframes].sort((left, right) => left.tick - right.tick);

  return ordered.map((keyframe, index) => {
    if (index === ordered.length - 1) {
      const { interpolation: _drop, ...withoutInterpolation } = keyframe;

      return withoutInterpolation;
    }

    return keyframe.interpolation === undefined ?
        { ...keyframe, interpolation: DEFAULT_SEGMENT_INTERPOLATION }
      : keyframe;
  });
}

export function createKeyframeV1(options: {
  readonly id: Id;
  readonly tick: number;
  readonly value: projectFormatV1.TypedValue;
  readonly interpolation?: projectFormatV1.Interpolation | undefined;
}): Keyframe {
  return options.interpolation === undefined ?
      { id: options.id, tick: options.tick, value: options.value }
    : { id: options.id, tick: options.tick, value: options.value, interpolation: options.interpolation };
}

export function createTrackV1(options: {
  readonly id: Id;
  readonly name: string;
  readonly target: projectFormatV1.PropertyTarget;
  readonly valueType: projectFormatV1.ValueType;
  readonly keyframes: readonly Keyframe[];
}): Track {
  return {
    id: options.id,
    name: options.name,
    target: options.target,
    valueType: options.valueType,
    keyframes: normalizeTrackKeyframes(options.keyframes),
  };
}

export function createSequenceV1(options: {
  readonly id: Id;
  readonly name: string;
  readonly durationTicks: number;
  readonly tracks?: readonly Track[] | undefined;
  readonly loop?: projectFormatV1.LoopDefinition | undefined;
}): Sequence {
  return {
    id: options.id,
    name: options.name,
    durationTicks: options.durationTicks,
    loop: options.loop ?? { kind: 'none' },
    tracks: options.tracks ?? [],
    markers: [],
    cues: [],
    childClips: [],
  };
}

/**
 * Apply a document updater, validate, and commit — but preserve the original project reference when
 * the updater reports no change (returns the same document), so callers can treat a missing-target
 * mutation as a genuine no-op via identity equality.
 */
function commitDocument(project: Project, documentId: Id, updater: (document: Document) => Document): Project {
  const document = project.documents.find(({ id }) => id === documentId);

  if (document === undefined) return project;

  const nextDocument = updater(document);

  if (nextDocument === document) return project;

  const candidate: Project = {
    ...project,
    documents: project.documents.map((candidateDocument) =>
      candidateDocument.id === documentId ? nextDocument : candidateDocument,
    ),
  };

  return isValidProject(candidate) ? candidate : project;
}

function withSequence(document: Document, sequenceId: Id, updater: (sequence: Sequence) => Sequence): Document {
  const index = document.sequences.findIndex(({ id }) => id === sequenceId);
  const sequence = document.sequences[index];

  if (sequence === undefined) return document;

  const nextSequence = updater(sequence);

  if (nextSequence === sequence) return document;

  return { ...document, sequences: document.sequences.map((candidate, i) => (i === index ? nextSequence : candidate)) };
}

function withTrack(sequence: Sequence, trackId: Id, updater: (track: Track) => Track | undefined): Sequence {
  const index = sequence.tracks.findIndex(({ id }) => id === trackId);
  const track = sequence.tracks[index];

  if (track === undefined) return sequence;

  const nextTrack = updater(track);

  if (nextTrack === track) return sequence;

  const tracks =
    nextTrack === undefined ?
      sequence.tracks.filter((_, i) => i !== index)
    : sequence.tracks.map((candidate, i) => (i === index ? nextTrack : candidate));

  return { ...sequence, tracks };
}

export function addSequenceInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly sequence: Sequence;
}): Project {
  return commitDocument(options.project, options.documentId, (document) => ({
    ...document,
    sequences: [...document.sequences, options.sequence],
  }));
}

export function removeSequenceInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly sequenceId: Id;
}): Project {
  return commitDocument(options.project, options.documentId, (document) => {
    const hasSequence = document.sequences.some(({ id }) => id === options.sequenceId);
    const hasPageReference = document.pages.some((page) => page.sequenceId === options.sequenceId);

    if (!hasSequence && !hasPageReference) return document;

    return {
      ...document,
      sequences: document.sequences.filter(({ id }) => id !== options.sequenceId),
      pages: document.pages.map((page) => {
        if (page.sequenceId !== options.sequenceId) return page;

        const { sequenceId: _drop, ...withoutSequenceId } = page;

        return withoutSequenceId;
      }),
    };
  });
}

export function createTrackInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly sequenceId: Id;
  readonly track: Track;
}): Project {
  return commitDocument(options.project, options.documentId, (document) =>
    withSequence(document, options.sequenceId, (sequence) => ({
      ...sequence,
      tracks: [...sequence.tracks, options.track],
    })),
  );
}

export function addKeyframeInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly sequenceId: Id;
  readonly trackId: Id;
  readonly keyframe: Keyframe;
}): Project {
  return commitDocument(options.project, options.documentId, (document) =>
    withSequence(document, options.sequenceId, (sequence) =>
      withTrack(sequence, options.trackId, (track) => ({
        ...track,
        keyframes: normalizeTrackKeyframes([...track.keyframes, options.keyframe]),
      })),
    ),
  );
}

export function updateKeyframeInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly sequenceId: Id;
  readonly trackId: Id;
  readonly keyframeId: Id;
  readonly update: {
    readonly tick?: number | undefined;
    readonly value?: projectFormatV1.TypedValue | undefined;
    readonly interpolation?: projectFormatV1.Interpolation | undefined;
  };
}): Project {
  return commitDocument(options.project, options.documentId, (document) =>
    withSequence(document, options.sequenceId, (sequence) =>
      withTrack(sequence, options.trackId, (track) => ({
        ...track,
        keyframes: normalizeTrackKeyframes(
          track.keyframes.map((keyframe) =>
            keyframe.id === options.keyframeId ?
              {
                ...keyframe,
                ...(options.update.tick === undefined ? {} : { tick: options.update.tick }),
                ...(options.update.value === undefined ? {} : { value: options.update.value }),
                ...(options.update.interpolation === undefined ? {} : { interpolation: options.update.interpolation }),
              }
            : keyframe,
          ),
        ),
      })),
    ),
  );
}

export function setSequenceDurationInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly sequenceId: Id;
  readonly durationTicks: number;
}): Project {
  return commitDocument(options.project, options.documentId, (document) =>
    withSequence(document, options.sequenceId, (sequence) =>
      sequence.durationTicks === options.durationTicks ? sequence : { ...sequence, durationTicks: options.durationTicks },
    ),
  );
}

export function removeKeyframeInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly sequenceId: Id;
  readonly trackId: Id;
  readonly keyframeId: Id;
}): Project {
  return commitDocument(options.project, options.documentId, (document) =>
    withSequence(document, options.sequenceId, (sequence) =>
      withTrack(sequence, options.trackId, (track) => {
        const remaining = track.keyframes.filter(({ id }) => id !== options.keyframeId);

        return remaining.length === 0 ? undefined : { ...track, keyframes: normalizeTrackKeyframes(remaining) };
      }),
    ),
  );
}
