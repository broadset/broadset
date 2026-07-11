import type { Diagnostic } from './diagnostics';
import { findGraphCycleEdges, graphEdgeKey } from './graph-cycles';
import type { Id } from './identity';
import { type AddressScope, createComponentAddressScope, createDocumentAddressScope } from './resolved-address';
import type { ComponentSemanticIndex, DocumentSemanticIndex, SemanticIndexes } from './semantic-index';
import {
  createSemanticError,
  typedValueMatchesTargetContract,
  valueTypesCompatible,
} from './semantic-validation-helpers';
import { validateGuardExpression } from './semantic-validation-pages';
import { interpolationMatchesType, type Sequence, type SequenceAction } from './sequence';
import { resolvePropertyTargetContractInScope } from './target-resolution';

function validateTarget(
  indexes: SemanticIndexes,
  scope: AddressScope,
  track: Sequence['tracks'][number],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const expected = resolvePropertyTargetContractInScope(scope, track.target);

  if (expected === undefined)
    diagnostics.push(
      createSemanticError('target.invalid-pointer', 'Property target does not resolve in its owning scope', pointer),
    );
  else if (!valueTypesCompatible(track.valueType, expected.valueType))
    diagnostics.push(createSemanticError('target.incompatible-value', 'Property value type is incompatible', pointer));
  else
    track.keyframes.forEach((keyframe, index) => {
      if (!typedValueMatchesTargetContract(indexes, keyframe.value, expected))
        diagnostics.push(
          createSemanticError(
            'target.incompatible-value',
            'Keyframe value is incompatible',
            `${pointer.replace(/\/target$/u, '')}/keyframes/${String(index)}/value`,
          ),
        );
    });
}

function validateAudioAsset(indexes: SemanticIndexes, assetId: Id, pointer: string, diagnostics: Diagnostic[]): void {
  const asset = indexes.assets.get(assetId);

  if (asset === undefined)
    diagnostics.push(createSemanticError('resource.missing-reference', 'Asset does not resolve', pointer));
  else if (asset.kind !== 'audio')
    diagnostics.push(createSemanticError('resource.wrong-kind', 'Expected audio asset', pointer));
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

    if (machine === undefined)
      diagnostics.push(
        createSemanticError('state.missing-machine', 'State machine does not resolve', `${pointer}/stateMachineId`),
      );
    else if (
      !machine.transitions.some(
        (transition) => transition.trigger.kind === 'event' && transition.trigger.eventId === action.eventId,
      )
    )
      diagnostics.push(
        createSemanticError('state.missing-event', 'State-machine event does not resolve', `${pointer}/eventId`),
      );

    return;
  }

  const sequence = sequences.get(action.sequenceId);

  if (sequence === undefined) {
    diagnostics.push(
      createSemanticError('sequence.missing-reference', 'Sequence does not resolve', `${pointer}/sequenceId`),
    );
  } else if (action.kind === 'seek-sequence' && action.tick > sequence.durationTicks) {
    diagnostics.push(
      createSemanticError('sequence.invalid-seek', 'Seek tick exceeds sequence duration', `${pointer}/tick`),
    );
  }
}

function validateSequenceGroup(
  indexes: SemanticIndexes,
  scope: AddressScope,
  sequences: readonly Sequence[],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const byId = new Map(sequences.map((sequence) => [sequence.id, sequence]));
  const cycleEdges = findGraphCycleEdges(
    sequences.map(({ id }) => id),
    (id) => byId.get(id)?.childClips.map(({ sequenceId }) => sequenceId) ?? [],
  );

  sequences.forEach((sequence, sequencePosition) => {
    const base = `${pointer}/${String(sequencePosition)}`;

    if (sequence.workArea !== undefined) {
      if (sequence.workArea[0] >= sequence.workArea[1] || sequence.workArea[1] > sequence.durationTicks) {
        diagnostics.push(createSemanticError('sequence.invalid-interval', 'Work area is invalid', `${base}/workArea`));
      }
    }

    sequence.tracks.forEach((track, trackPosition) => {
      const trackBase = `${base}/tracks/${String(trackPosition)}`;

      track.keyframes.forEach((keyframe, keyframePosition) => {
        const keyframeBase = `${trackBase}/keyframes/${String(keyframePosition)}`;
        const previous = track.keyframes[keyframePosition - 1];
        const isFinal = keyframePosition === track.keyframes.length - 1;

        if (keyframe.value.type !== track.valueType) {
          diagnostics.push(
            createSemanticError(
              'sequence.incompatible-keyframe',
              'Keyframe value must match track type',
              `${keyframeBase}/value`,
            ),
          );
        }

        if (previous !== undefined && keyframe.tick <= previous.tick) {
          diagnostics.push(
            createSemanticError(
              'sequence.invalid-keyframe-order',
              'Keyframe ticks must increase',
              `${keyframeBase}/tick`,
            ),
          );
        }

        if (keyframe.tick > sequence.durationTicks) {
          diagnostics.push(
            createSemanticError(
              'sequence.invalid-keyframe-tick',
              'Keyframe exceeds sequence duration',
              `${keyframeBase}/tick`,
            ),
          );
        }

        if (isFinal === (keyframe.interpolation !== undefined)) {
          diagnostics.push(
            createSemanticError(
              'sequence.invalid-interpolation',
              isFinal ? 'Final keyframe forbids interpolation' : 'Non-final keyframe requires interpolation',
              `${keyframeBase}/interpolation`,
            ),
          );
        }

        if (
          keyframe.interpolation !== undefined &&
          !interpolationMatchesType(keyframe.interpolation, track.valueType)
        ) {
          diagnostics.push(
            createSemanticError(
              'sequence.invalid-interpolation',
              'Interpolation is incompatible with track type',
              `${keyframeBase}/interpolation`,
            ),
          );
        }
      });
      validateTarget(indexes, scope, track, `${base}/tracks/${String(trackPosition)}/target`, diagnostics);
    });
    sequence.markers.forEach((marker, markerPosition) => {
      if (marker.tick > sequence.durationTicks)
        diagnostics.push(
          createSemanticError(
            'sequence.invalid-marker-tick',
            'Marker exceeds sequence duration',
            `${base}/markers/${String(markerPosition)}/tick`,
          ),
        );
    });
    sequence.cues.forEach((cue, cuePosition) => {
      if (cue.tick > sequence.durationTicks)
        diagnostics.push(
          createSemanticError(
            'sequence.invalid-cue-tick',
            'Cue exceeds sequence duration',
            `${base}/cues/${String(cuePosition)}/tick`,
          ),
        );
      if (cue.kind === 'audio')
        validateAudioAsset(indexes, cue.assetId, `${base}/cues/${String(cuePosition)}/assetId`, diagnostics);
    });
    sequence.childClips.forEach((clip, clipPosition) => {
      const child = byId.get(clip.sequenceId);
      const clipPointer = `${base}/childClips/${String(clipPosition)}`;

      if (clip.outputRange[0] >= clip.outputRange[1] || clip.outputRange[1] > sequence.durationTicks) {
        diagnostics.push(
          createSemanticError(
            'sequence.invalid-interval',
            'Child output range is invalid',
            `${clipPointer}/outputRange`,
          ),
        );
      }

      if (clip.remap.kind === 'linear' && clip.remap.sourceRange[0] >= clip.remap.sourceRange[1]) {
        diagnostics.push(
          createSemanticError(
            'sequence.invalid-interval',
            'Child source range is invalid',
            `${clipPointer}/remap/sourceRange`,
          ),
        );
      }

      if (clip.stagger !== undefined) {
        const maximumEnd =
          BigInt(clip.outputRange[1]) +
          BigInt(clip.stagger.index) * BigInt(clip.stagger.intervalTicks) +
          BigInt(clip.stagger.jitterTicks);

        if (maximumEnd > BigInt(sequence.durationTicks))
          diagnostics.push(
            createSemanticError(
              'sequence.invalid-stagger',
              'Staggered child clip exceeds duration',
              `${clipPointer}/stagger`,
            ),
          );
      }

      if (child === undefined) {
        diagnostics.push(
          createSemanticError(
            'sequence.missing-reference',
            'Child sequence does not resolve',
            `${clipPointer}/sequenceId`,
          ),
        );

        return;
      }

      const invalidRemap =
        clip.remap.kind === 'linear' ?
          clip.remap.sourceRange[1] > child.durationTicks
        : clip.remap.sourceTick >= child.durationTicks;

      if (invalidRemap)
        diagnostics.push(
          createSemanticError(
            'sequence.invalid-interval',
            'Child remap exceeds sequence duration',
            `${clipPointer}/remap`,
          ),
        );
      if (cycleEdges.has(graphEdgeKey(sequence.id, clip.sequenceId)))
        diagnostics.push(
          createSemanticError('sequence.cycle', 'Child sequence dependency cycle', `${clipPointer}/sequenceId`),
        );
    });

    if (sequence.loop.kind !== 'none' && sequence.loop.count !== undefined) {
      const count = BigInt(sequence.loop.count);
      const duration = BigInt(sequence.durationTicks) * count + BigInt(sequence.loop.gapTicks) * (count - 1n);

      if (duration > BigInt(Number.MAX_SAFE_INTEGER))
        diagnostics.push(
          createSemanticError(
            'sequence.loop-overflow',
            'Finite loop duration exceeds safe integer range',
            `${base}/loop`,
          ),
        );
    }
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
    const stateIds = new Set(machine.states.map(({ id }) => id));

    if (!stateIds.has(machine.initialStateId))
      diagnostics.push(
        createSemanticError(
          'state.missing-initial',
          'Initial state does not resolve',
          `${machinePointer}/initialStateId`,
        ),
      );

    const priorities = new Set<string>();

    machine.states.forEach((state, statePosition) => {
      const statePointer = `${machinePointer}/states/${String(statePosition)}`;

      state.values.forEach((stateValue, valuePosition) => {
        const targetContract = resolvePropertyTargetContractInScope(scope, stateValue.target);
        const pointer = `${statePointer}/values/${String(valuePosition)}`;

        if (targetContract === undefined)
          diagnostics.push(
            createSemanticError('target.invalid-pointer', 'State target is invalid', `${pointer}/target`),
          );
        else if (!typedValueMatchesTargetContract(indexes, stateValue.value, targetContract))
          diagnostics.push(
            createSemanticError('target.incompatible-value', 'State value is incompatible', `${pointer}/value`),
          );
      });
      state.entryActions.forEach((action, actionPosition) => {
        validateAction(
          action,
          document.sequences,
          document,
          `${statePointer}/entryActions/${String(actionPosition)}`,
          diagnostics,
        );
      });
      state.exitActions.forEach((action, actionPosition) => {
        validateAction(
          action,
          document.sequences,
          document,
          `${statePointer}/exitActions/${String(actionPosition)}`,
          diagnostics,
        );
      });
    });
    machine.transitions.forEach((transition, transitionPosition) => {
      const transitionPointer = `${machinePointer}/transitions/${String(transitionPosition)}`;

      if (!stateIds.has(transition.sourceStateId))
        diagnostics.push(
          createSemanticError(
            'state.missing-source',
            'Source state does not resolve',
            `${transitionPointer}/sourceStateId`,
          ),
        );
      if (!stateIds.has(transition.targetStateId))
        diagnostics.push(
          createSemanticError(
            'state.missing-target',
            'Target state does not resolve',
            `${transitionPointer}/targetStateId`,
          ),
        );

      const priorityKey = JSON.stringify([transition.sourceStateId, transition.trigger, transition.priority]);

      if (priorities.has(priorityKey))
        diagnostics.push(
          createSemanticError(
            'state.duplicate-priority',
            'Duplicate priority for source and trigger',
            `${transitionPointer}/priority`,
          ),
        );
      priorities.add(priorityKey);

      if (transition.guard !== undefined && !validateGuardExpression(indexes, document, transition.guard))
        diagnostics.push(
          createSemanticError(
            'state.invalid-guard',
            'Transition guard must resolve to boolean',
            `${transitionPointer}/guard`,
          ),
        );
      transition.actions.forEach((action, actionPosition) => {
        validateAction(
          action,
          document.sequences,
          document,
          `${transitionPointer}/actions/${String(actionPosition)}`,
          diagnostics,
        );
      });
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
  validateSequenceGroup(
    indexes,
    createComponentAddressScope(document, component),
    component.component.sequences,
    pointer,
    diagnostics,
  );
}

export function validateSequences(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.documentList.forEach((document, documentPosition) => {
    const pointer = `/documents/${String(documentPosition)}`;

    validateSequenceGroup(
      indexes,
      createDocumentAddressScope(document),
      document.document.sequences,
      `${pointer}/sequences`,
      diagnostics,
    );
    document.document.components.forEach((component, componentPosition) => {
      const componentIndex = document.components.get(component.id);

      if (componentIndex !== undefined)
        validateComponentSequences(
          indexes,
          document,
          componentIndex,
          `${pointer}/components/${String(componentPosition)}/sequences`,
          diagnostics,
        );
    });

    const lifecycle = document.document.lifecycle;

    if (lifecycle !== undefined) {
      const phases = [
        ['in', lifecycle.in],
        ['hold', lifecycle.hold],
        ['update', lifecycle.update],
        ['out', lifecycle.out],
      ] as const;

      phases.forEach(([phase, actions]) => {
        actions.forEach((action, index) => {
          validateAction(
            action,
            document.sequences,
            document,
            `${pointer}/lifecycle/${phase}/${String(index)}`,
            diagnostics,
          );
        });
      });
    }

    validateStateMachines(indexes, document, documentPosition, diagnostics);
  });
}
