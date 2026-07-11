import type { Diagnostic } from './diagnostics';
import type { Id } from './identity';
import {
  type AddressScope,
  createComponentAddressScope,
  createDocumentAddressScope,
} from './resolved-address';
import type { ComponentSemanticIndex, DocumentSemanticIndex, SemanticIndexes } from './semantic-index';
import { createSemanticError, typedValueMatchesType, valueTypesCompatible } from './semantic-validation-helpers';
import { validateGuardExpression } from './semantic-validation-pages';
import type { Sequence, SequenceAction } from './sequence';
import { resolvePropertyTargetValueTypeInScope } from './target-resolution';
import type { ValueType } from './typed-value';

function validateTarget(
  scope: AddressScope,
  target: Sequence['tracks'][number]['target'],
  valueType: ValueType,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const expected = resolvePropertyTargetValueTypeInScope(scope, target);

  if (expected === undefined) diagnostics.push(createSemanticError('target.invalid-pointer', 'Property target does not resolve in its owning scope', pointer));
  else if (!valueTypesCompatible(valueType, expected)) diagnostics.push(createSemanticError('target.incompatible-value', 'Property value type is incompatible', pointer));
}

function validateAudioAsset(indexes: SemanticIndexes, assetId: Id, pointer: string, diagnostics: Diagnostic[]): void {
  const asset = indexes.assets.get(assetId);

  if (asset === undefined) diagnostics.push(createSemanticError('resource.missing-reference', 'Asset does not resolve', pointer));
  else if (asset.kind !== 'audio') diagnostics.push(createSemanticError('resource.wrong-kind', 'Expected audio asset', pointer));
}

function validateAction(
  action: SequenceAction,
  sequences: ReadonlyMap<Id, Sequence>,
  document: DocumentSemanticIndex,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (action.kind === 'send-event') {
    const machine = document.document.stateMachines.find((candidate) => candidate.id === action.stateMachineId);

    if (machine === undefined) diagnostics.push(createSemanticError('state.missing-machine', 'State machine does not resolve', `${pointer}/stateMachineId`));
    else if (!machine.transitions.some((transition) => transition.trigger.kind === 'event' && transition.trigger.eventId === action.eventId)) diagnostics.push(createSemanticError('state.missing-event', 'State-machine event does not resolve', `${pointer}/eventId`));

    return;
  }

  const sequence = sequences.get(action.sequenceId);

  if (sequence === undefined) {
    diagnostics.push(createSemanticError('sequence.missing-reference', 'Sequence does not resolve', `${pointer}/sequenceId`));
  } else if (action.kind === 'seek-sequence' && action.tick > sequence.durationTicks) {
    diagnostics.push(createSemanticError('sequence.invalid-seek', 'Seek tick exceeds sequence duration', `${pointer}/tick`));
  }
}

function sequenceReaches(sequences: ReadonlyMap<Id, Sequence>, startId: Id, targetId: Id, seen: ReadonlySet<Id>): boolean {
  if (seen.has(startId)) return false;

  const sequence = sequences.get(startId);

  if (sequence === undefined) return false;

  const nextSeen = new Set([...seen, startId]);

  return sequence.childClips.some((clip) => clip.sequenceId === targetId || sequenceReaches(sequences, clip.sequenceId, targetId, nextSeen));
}

function validateSequenceGroup(
  indexes: SemanticIndexes,
  scope: AddressScope,
  sequences: readonly Sequence[],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const byId = new Map(sequences.map((sequence) => [sequence.id, sequence]));

  sequences.forEach((sequence, sequencePosition) => {
    const base = `${pointer}/${String(sequencePosition)}`;

    sequence.tracks.forEach((track, trackPosition) => {
      validateTarget(scope, track.target, track.valueType, `${base}/tracks/${String(trackPosition)}/target`, diagnostics);
    });
    sequence.cues.forEach((cue, cuePosition) => {
      if (cue.kind === 'audio') validateAudioAsset(indexes, cue.assetId, `${base}/cues/${String(cuePosition)}/assetId`, diagnostics);
    });
    sequence.childClips.forEach((clip, clipPosition) => {
      const child = byId.get(clip.sequenceId);
      const clipPointer = `${base}/childClips/${String(clipPosition)}`;

      if (child === undefined) { diagnostics.push(createSemanticError('sequence.missing-reference', 'Child sequence does not resolve', `${clipPointer}/sequenceId`));

 return; }

      const invalidRemap =
        clip.remap.kind === 'linear'
          ? clip.remap.sourceRange[1] > child.durationTicks
          : clip.remap.sourceTick >= child.durationTicks;

      if (invalidRemap) diagnostics.push(createSemanticError('sequence.invalid-interval', 'Child remap exceeds sequence duration', `${clipPointer}/remap`));
      if (clip.sequenceId === sequence.id || sequenceReaches(byId, clip.sequenceId, sequence.id, new Set())) diagnostics.push(createSemanticError('sequence.cycle', 'Child sequence dependency cycle', `${clipPointer}/sequenceId`));
    });
  });
}

function validateStateMachines(
  indexes: SemanticIndexes,
  document: DocumentSemanticIndex,
  documentPosition: number,
  diagnostics: Diagnostic[],
): void {
  const scope = createDocumentAddressScope(document);

  document.document.stateMachines.forEach((machine, machinePosition) => {
    const machinePointer = `/documents/${String(documentPosition)}/stateMachines/${String(machinePosition)}`;

    machine.states.forEach((state, statePosition) => {
      const statePointer = `${machinePointer}/states/${String(statePosition)}`;

      state.values.forEach((stateValue, valuePosition) => {
        const targetType = resolvePropertyTargetValueTypeInScope(scope, stateValue.target);
        const pointer = `${statePointer}/values/${String(valuePosition)}`;

        if (targetType === undefined) diagnostics.push(createSemanticError('target.invalid-pointer', 'State target is invalid', `${pointer}/target`));
        else if (!typedValueMatchesType(stateValue.value, targetType)) diagnostics.push(createSemanticError('target.incompatible-value', 'State value is incompatible', `${pointer}/value`));
      });
      state.entryActions.forEach((action, actionPosition) => { validateAction(action, document.sequences, document, `${statePointer}/entryActions/${String(actionPosition)}`, diagnostics); });
      state.exitActions.forEach((action, actionPosition) => { validateAction(action, document.sequences, document, `${statePointer}/exitActions/${String(actionPosition)}`, diagnostics); });
    });
    machine.transitions.forEach((transition, transitionPosition) => {
      const transitionPointer = `${machinePointer}/transitions/${String(transitionPosition)}`;

      if (transition.guard !== undefined && !validateGuardExpression(indexes, document, transition.guard)) diagnostics.push(createSemanticError('state.invalid-guard', 'Transition guard must resolve to boolean', `${transitionPointer}/guard`));
      transition.actions.forEach((action, actionPosition) => { validateAction(action, document.sequences, document, `${transitionPointer}/actions/${String(actionPosition)}`, diagnostics); });
    });
  });
}

function validateComponentSequences(
  indexes: SemanticIndexes,
  document: DocumentSemanticIndex,
  component: ComponentSemanticIndex,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  validateSequenceGroup(indexes, createComponentAddressScope(document, component), component.component.sequences, pointer, diagnostics);
}

export function validateSequences(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.documentList.forEach((document, documentPosition) => {
    const pointer = `/documents/${String(documentPosition)}`;

    validateSequenceGroup(indexes, createDocumentAddressScope(document), document.document.sequences, `${pointer}/sequences`, diagnostics);
    document.document.components.forEach((component, componentPosition) => {
      const componentIndex = document.components.get(component.id);

      if (componentIndex !== undefined) validateComponentSequences(indexes, document, componentIndex, `${pointer}/components/${String(componentPosition)}/sequences`, diagnostics);
    });

    const lifecycle = document.document.lifecycle;

    if (lifecycle !== undefined) {
      const phases = [['in', lifecycle.in], ['hold', lifecycle.hold], ['update', lifecycle.update], ['out', lifecycle.out]] as const;

      phases.forEach(([phase, actions]) => { actions.forEach((action, index) => { validateAction(action, document.sequences, document, `${pointer}/lifecycle/${phase}/${String(index)}`, diagnostics); }); });
    }

    validateStateMachines(indexes, document, documentPosition, diagnostics);
  });
}
