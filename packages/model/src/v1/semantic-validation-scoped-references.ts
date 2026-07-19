import type { Diagnostic } from './diagnostics';
import type { Element, StructuredPath } from './element';
import type { Id } from './identity';
import type { SemanticIndexes } from './semantic-index';
import { createSemanticError } from './semantic-validation-helpers';
import type { Sequence } from './sequence';

interface ValidationOptions {
  readonly indexes: SemanticIndexes;
  readonly elements: readonly Element[];
  readonly sequences: readonly Sequence[];
  readonly pointer: string;
  readonly diagnostics: Diagnostic[];
}

interface PathValidationOptions {
  readonly path: StructuredPath;
  readonly pointer: string;
  readonly diagnostics: Diagnostic[];
}

interface IdValidationOptions {
  readonly seen: Set<Id>;
  readonly id: Id;
  readonly pointer: string;
  readonly diagnostics: Diagnostic[];
}

function addScopedId({ seen, id, pointer, diagnostics }: IdValidationOptions): void {
  if (seen.has(id)) {
    diagnostics.push(createSemanticError('identity.duplicate', `Duplicate ID: ${id}`, pointer));
  }

  seen.add(id);
}

function validatePathReferences({ path, pointer, diagnostics }: PathValidationOptions): void {
  const pointCounts = new Map<Id, number>();

  path.points.forEach((point) => pointCounts.set(point.id, (pointCounts.get(point.id) ?? 0) + 1));
  path.segments.forEach((segment, segmentIndex) => {
    if (segment.kind === 'close') return;

    const count = pointCounts.get(segment.pointId) ?? 0;
    const segmentPointer = `${pointer}/segments/${String(segmentIndex)}/pointId`;

    if (count === 0) {
      diagnostics.push(createSemanticError('path.missing-point', 'Path segment point does not resolve', segmentPointer));
    } else if (count > 1) {
      diagnostics.push(createSemanticError('path.ambiguous-point', 'Path segment point is not unique', segmentPointer));
    }
  });
}

function validateRunFont(
  { indexes, run, pointer, diagnostics }: {
    readonly indexes: SemanticIndexes;
    readonly run: Extract<Element, { readonly kind: 'text' }>['text']['paragraphs'][number]['runs'][number];
    readonly pointer: string;
    readonly diagnostics: Diagnostic[];
  },
): void {
  const family = indexes.fonts.get(run.properties.fontFamilyId);

  if (family === undefined) {
    diagnostics.push(createSemanticError('resource.missing-reference', 'Font family does not resolve', `${pointer}/fontFamilyId`));
  }

  if (family === undefined || indexes.fontFaces.get(family.id)?.has(run.properties.fontFaceId) !== true) {
    diagnostics.push(createSemanticError('resource.missing-reference', 'Font face does not resolve in the selected family', `${pointer}/fontFaceId`));
  }
}

function validateElementScope({ indexes, elements, pointer, diagnostics }: Omit<ValidationOptions, 'sequences'>): void {
  const paragraphs = new Set<Id>();
  const runs = new Set<Id>();
  const fills = new Set<Id>();
  const strokes = new Set<Id>();
  const effects = new Set<Id>();
  const gradientStops = new Set<Id>();
  const pathPoints = new Set<Id>();

  elements.forEach((element, elementIndex) => {
    const elementPointer = `${pointer}/${String(elementIndex)}`;

    element.appearance.fills.forEach((fill, fillIndex) => {
      const fillPointer = `${elementPointer}/appearance/fills/${String(fillIndex)}`;

      addScopedId({ seen: fills, id: fill.id, pointer: `${fillPointer}/id`, diagnostics });
      if (fill.paint.kind === 'gradient') fill.paint.gradient.stops.forEach((stop, stopIndex) => {
        addScopedId({ seen: gradientStops, id: stop.id, pointer: `${fillPointer}/paint/gradient/stops/${String(stopIndex)}/id`, diagnostics });
      });
    });
    element.appearance.strokes.forEach((stroke, strokeIndex) => {
      const strokePointer = `${elementPointer}/appearance/strokes/${String(strokeIndex)}`;

      addScopedId({ seen: strokes, id: stroke.id, pointer: `${strokePointer}/id`, diagnostics });
      if (stroke.paint.kind === 'gradient') stroke.paint.gradient.stops.forEach((stop, stopIndex) => {
        addScopedId({ seen: gradientStops, id: stop.id, pointer: `${strokePointer}/paint/gradient/stops/${String(stopIndex)}/id`, diagnostics });
      });
    });
    element.appearance.effects.forEach((effect, effectIndex) => {
      addScopedId({ seen: effects, id: effect.id, pointer: `${elementPointer}/appearance/effects/${String(effectIndex)}/id`, diagnostics });
    });

    if (element.kind === 'text') element.text.paragraphs.forEach((paragraph, paragraphIndex) => {
      const paragraphPointer = `${elementPointer}/text/paragraphs/${String(paragraphIndex)}`;

      addScopedId({ seen: paragraphs, id: paragraph.id, pointer: `${paragraphPointer}/id`, diagnostics });
      paragraph.runs.forEach((run, runIndex) => {
        const runPointer = `${paragraphPointer}/runs/${String(runIndex)}`;

        addScopedId({ seen: runs, id: run.id, pointer: `${runPointer}/id`, diagnostics });
        validateRunFont({ indexes, run, pointer: `${runPointer}/properties`, diagnostics });
      });
    });

    if (element.kind === 'vector' && element.geometryData.kind === 'path') {
      const pathPointer = `${elementPointer}/geometryData/path`;

      element.geometryData.path.points.forEach((point, pointIndex) => {
        addScopedId({ seen: pathPoints, id: point.id, pointer: `${pathPointer}/points/${String(pointIndex)}/id`, diagnostics });
      });
      validatePathReferences({ path: element.geometryData.path, pointer: pathPointer, diagnostics });
    }
  });
}

function validateSequencePaths(sequences: readonly Sequence[], pointer: string, diagnostics: Diagnostic[]): void {
  sequences.forEach((sequence, sequenceIndex) => {
    sequence.tracks.forEach((track, trackIndex) => {
      track.keyframes.forEach((keyframe, keyframeIndex) => {
        if (keyframe.interpolation?.kind !== 'spatial-path') return;

        validatePathReferences({
          path: keyframe.interpolation.path,
          pointer: `${pointer}/${String(sequenceIndex)}/tracks/${String(trackIndex)}/keyframes/${String(keyframeIndex)}/interpolation/path`,
          diagnostics,
        });
      });
    });
  });
}

export function validateScopedReferences(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.documentList.forEach(({ document }, documentIndex) => {
    const documentPointer = `/documents/${String(documentIndex)}`;

    validateElementScope({ indexes, elements: document.elements, pointer: `${documentPointer}/elements`, diagnostics });
    validateSequencePaths(document.sequences, `${documentPointer}/sequences`, diagnostics);
    document.components.forEach((component, componentIndex) => {
      const componentPointer = `${documentPointer}/components/${String(componentIndex)}`;

      validateElementScope({ indexes, elements: component.elements, pointer: `${componentPointer}/elements`, diagnostics });
      validateSequencePaths(component.sequences, `${componentPointer}/sequences`, diagnostics);
    });
  });
}
