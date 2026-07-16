import type { projectFormatV1 } from '@broadset/model';

import { evaluateBindingV1 } from './binding-eval';
import type { ExpressionContextV1 } from './expression-eval';
import { sampleSequenceV1 } from './sequence-sampler';
import { stateMachineValuesV1 } from './state-machine';

type PropertyTarget = projectFormatV1.PropertyTarget;
type TypedValue = projectFormatV1.TypedValue;
type Binding = projectFormatV1.Binding;
type StateMachine = projectFormatV1.StateMachine;
type Sequence = projectFormatV1.Sequence;
type Id = projectFormatV1.Id;

const TARGET_FIELD_SEPARATOR = '\u0000';
const INSTANCE_PATH_SEPARATOR = '\u001f';

export type PropertyProvenanceV1 =
  | { readonly kind: 'binding'; readonly bindingId: Id }
  | { readonly kind: 'state'; readonly stateMachineId: Id; readonly stateId: Id }
  | { readonly kind: 'sequence'; readonly sequenceId: Id };

export interface PropertyContributionV1 {
  readonly target: PropertyTarget;
  readonly value: TypedValue;
  readonly provenance: PropertyProvenanceV1;
}

export interface ResolvedPropertyV1 {
  readonly target: PropertyTarget;
  readonly value: TypedValue;
  readonly provenance: PropertyProvenanceV1;
  readonly overridden: readonly PropertyProvenanceV1[];
}

export function propertyTargetKeyV1(target: PropertyTarget): string {
  const { entity } = target;

  return [
    entity.projectId,
    entity.documentId ?? '',
    entity.pageId ?? '',
    entity.entityKind,
    entity.entityId,
    (entity.instancePath ?? []).join(INSTANCE_PATH_SEPARATOR),
    target.pointer,
  ].join(TARGET_FIELD_SEPARATOR);
}

export function resolvePropertyMapV1(
  contributions: readonly PropertyContributionV1[],
): ReadonlyMap<string, ResolvedPropertyV1> {
  const resolved = new Map<string, ResolvedPropertyV1>();

  for (const contribution of contributions) {
    const key = propertyTargetKeyV1(contribution.target);
    const previous = resolved.get(key);

    resolved.set(
      key,
      previous === undefined
        ? { ...contribution, overridden: [] }
        : {
            ...contribution,
            overridden: [...previous.overridden, previous.provenance],
          },
    );
  }

  return resolved;
}

export function bindingContributionsV1(
  bindings: readonly Binding[],
  context: ExpressionContextV1,
): readonly PropertyContributionV1[] {
  return bindings.flatMap((binding) => {
    const resolved = evaluateBindingV1(binding, context);

    return resolved === undefined
      ? []
      : [
          {
            target: resolved.target,
            value: resolved.value,
            provenance: { kind: 'binding', bindingId: binding.id },
          },
        ];
  });
}

export function stateContributionsV1(
  machineStates: readonly { readonly machine: StateMachine; readonly stateId: Id }[],
): readonly PropertyContributionV1[] {
  return machineStates.flatMap(({ machine, stateId }) =>
    stateMachineValuesV1(machine, stateId).map((stateValue) => ({
      target: stateValue.target,
      value: stateValue.value,
      provenance: { kind: 'state', stateMachineId: machine.id, stateId },
    })),
  );
}

export function sequenceContributionsV1(
  activeSequences: readonly { readonly sequence: Sequence; readonly tick: number }[],
): readonly PropertyContributionV1[] {
  return activeSequences.flatMap(({ sequence, tick }) =>
    sampleSequenceV1(sequence, tick).map((sample) => ({
      target: sample.target,
      value: sample.value,
      provenance: { kind: 'sequence', sequenceId: sequence.id },
    })),
  );
}
