import type { Diagnostic } from './diagnostics';
import type { Id, PropertyTarget } from './identity';
import type { DocumentSemanticIndex, SemanticIndexes } from './semantic-index';
import { createSemanticError, valueTypesCompatible } from './semantic-validation-helpers';
import type { Sequence, SequenceAction } from './sequence';
import { resolvePropertyTargetValueTypeFromIndexes } from './target-resolution';
import type { ValueType } from './typed-value';

function validateTarget(indexes: SemanticIndexes, target: PropertyTarget, valueType: ValueType, pointer: string, diagnostics: Diagnostic[]): void {
  const expected = resolvePropertyTargetValueTypeFromIndexes(indexes, target);

  if (expected === undefined) diagnostics.push(createSemanticError('target.invalid-pointer', 'Property target does not resolve to an approved property', pointer));
  else if (!valueTypesCompatible(valueType, expected)) diagnostics.push(createSemanticError('target.incompatible-value', 'Property value type is incompatible', pointer));
}

function validateAudioAsset(indexes: SemanticIndexes, assetId: Id, pointer: string, diagnostics: Diagnostic[]): void {
  const asset = indexes.assets.get(assetId);

  if (asset === undefined) diagnostics.push(createSemanticError('resource.missing-reference', 'Asset does not resolve', pointer));
  else if (asset.kind !== 'audio') diagnostics.push(createSemanticError('resource.wrong-kind', 'Expected audio asset', pointer));
}

function validateAction(action: SequenceAction, document: DocumentSemanticIndex, pointer: string, diagnostics: Diagnostic[]): void {
  if (action.kind === 'send-event') {
    const machine = document.document.stateMachines.find((candidate) => candidate.id === action.stateMachineId);

    if (machine === undefined) diagnostics.push(createSemanticError('state.missing-machine', 'State machine does not resolve', `${pointer}/stateMachineId`));
    else if (!machine.transitions.some((transition) => transition.trigger.kind === 'event' && transition.trigger.eventId === action.eventId)) diagnostics.push(createSemanticError('state.missing-event', 'State-machine event does not resolve', `${pointer}/eventId`));
  } else if (!document.sequences.has(action.sequenceId)) diagnostics.push(createSemanticError('sequence.missing-reference', 'Sequence does not resolve', `${pointer}/sequenceId`));
}

function sequenceReaches(sequences: ReadonlyMap<Id, Sequence>, startId: Id, targetId: Id, seen: ReadonlySet<Id>): boolean {
  if (seen.has(startId)) return false;

  const sequence = sequences.get(startId);

  if (sequence === undefined) return false;

  const nextSeen = new Set([...seen, startId]);

  return sequence.childClips.some((clip) => clip.sequenceId === targetId || sequenceReaches(sequences, clip.sequenceId, targetId, nextSeen));
}

function validateSequenceGroup(indexes: SemanticIndexes, sequences: readonly Sequence[], pointer: string, diagnostics: Diagnostic[]): void {
  const byId = new Map(sequences.map((sequence) => [sequence.id, sequence]));

  sequences.forEach((sequence, sequencePosition) => {
    const base = `${pointer}/${String(sequencePosition)}`;

    sequence.tracks.forEach((track, trackPosition) => { validateTarget(indexes, track.target, track.valueType, `${base}/tracks/${String(trackPosition)}/target`, diagnostics); });
    sequence.cues.forEach((cue, cuePosition) => { if (cue.kind === 'audio') validateAudioAsset(indexes, cue.assetId, `${base}/cues/${String(cuePosition)}/assetId`, diagnostics); });
    sequence.childClips.forEach((clip, clipPosition) => {
      const child = byId.get(clip.sequenceId);
      const clipPointer = `${base}/childClips/${String(clipPosition)}`;

      if (child === undefined) { diagnostics.push(createSemanticError('sequence.missing-reference', 'Child sequence does not resolve', `${clipPointer}/sequenceId`));

 return; }

      const sourceEnd = clip.remap.kind === 'linear' ? clip.remap.sourceRange[1] : clip.remap.sourceTick;

      if (sourceEnd > child.durationTicks) diagnostics.push(createSemanticError('sequence.invalid-interval', 'Child remap exceeds sequence duration', `${clipPointer}/remap`));
      if (clip.sequenceId === sequence.id || sequenceReaches(byId, clip.sequenceId, sequence.id, new Set())) diagnostics.push(createSemanticError('sequence.cycle', 'Child sequence dependency cycle', `${clipPointer}/sequenceId`));
    });
  });
}

export function validateSequences(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.documentList.forEach((documentIndex, documentPosition) => {
    const pointer = `/documents/${String(documentPosition)}`;

    validateSequenceGroup(indexes, documentIndex.document.sequences, `${pointer}/sequences`, diagnostics);
    documentIndex.document.components.forEach((component, componentPosition) => { validateSequenceGroup(indexes, component.sequences, `${pointer}/components/${String(componentPosition)}/sequences`, diagnostics); });

    const lifecycle = documentIndex.document.lifecycle;

    if (lifecycle !== undefined) {
      const phases = [['in', lifecycle.in], ['hold', lifecycle.hold], ['update', lifecycle.update], ['out', lifecycle.out]] as const;

      phases.forEach(([phase, actions]) => { actions.forEach((action, index) => { validateAction(action, documentIndex, `${pointer}/lifecycle/${phase}/${String(index)}`, diagnostics); }); });
    }
  });
}
