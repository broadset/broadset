import type { projectFormatV1 } from '@broadset/model';

import { evaluateBindingV1 } from './binding-eval';
import type { ExpressionContextV1 } from './expression-eval';
import { sampleSequenceV1, type TrackSegmentProvenanceV1 } from './sequence-sampler';
import { stateMachineValuesV1 } from './state-machine';

type PropertyTarget = projectFormatV1.PropertyTarget;
type TypedValue = projectFormatV1.TypedValue;
type Id = projectFormatV1.Id;

const TARGET_FIELD_SEPARATOR = '\u0000';
const INSTANCE_PATH_SEPARATOR = '\u001f';
const TIER_RANK: Readonly<Record<PropertyTierV1, number>> = { binding: 0, state: 1, sequence: 2 };

export type PropertyTierV1 = 'binding' | 'state' | 'sequence';
export type PropertyProvenanceV1 =
  | { readonly kind: 'binding'; readonly bindingId: Id; readonly source: 'expression' | 'fallback' }
  | { readonly kind: 'state'; readonly stateMachineId: Id; readonly stateId: Id; readonly stateValueId: Id }
  | ({ readonly kind: 'sequence' } & TrackSegmentProvenanceV1);

export interface PropertyContributionV1 {
  readonly target: PropertyTarget;
  readonly value: TypedValue;
  readonly tier: PropertyTierV1;
  readonly canonicalOrder: readonly number[];
  readonly provenance: PropertyProvenanceV1;
}

export interface ResolvedPropertyV1 {
  readonly target: PropertyTarget;
  readonly value: TypedValue;
  readonly provenance: PropertyProvenanceV1;
  readonly overridden: readonly Pick<PropertyContributionV1, 'value' | 'provenance'>[];
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

function compareCanonicalOrder(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const comparison = (left[index] ?? -1) - (right[index] ?? -1);

    if (comparison !== 0) return comparison;
  }

  return 0;
}

function compareContributions(left: PropertyContributionV1, right: PropertyContributionV1): number {
  const tier = TIER_RANK[left.tier] - TIER_RANK[right.tier];

  if (tier !== 0) return tier;

  const order = compareCanonicalOrder(left.canonicalOrder, right.canonicalOrder);

  if (order !== 0) return order;

  return JSON.stringify(left.provenance).localeCompare(JSON.stringify(right.provenance), 'en');
}

export function resolvePropertyMapV1(contributions: readonly PropertyContributionV1[]): ReadonlyMap<string, ResolvedPropertyV1> {
  const grouped = new Map<string, PropertyContributionV1[]>();

  for (const contribution of contributions) {
    const key = propertyTargetKeyV1(contribution.target);

    grouped.set(key, [...(grouped.get(key) ?? []), contribution]);
  }

  const resolved = new Map<string, ResolvedPropertyV1>();

  for (const [key, candidates] of grouped) {
    const ordered = [...candidates].sort(compareContributions);
    const winner = ordered.at(-1);

    if (winner === undefined) continue;
    resolved.set(key, {
      target: winner.target,
      value: winner.value,
      provenance: winner.provenance,
      overridden: ordered.slice(0, -1).map(({ value, provenance }) => ({ value, provenance })),
    });
  }

  return resolved;
}

export function bindingContributionsV1(bindings: readonly projectFormatV1.Binding[], context: ExpressionContextV1): readonly PropertyContributionV1[] {
  return bindings.flatMap((binding, bindingIndex) => {
    const resolved = evaluateBindingV1(binding, context);

    return resolved === undefined ? [] : [{
      target: resolved.target,
      value: resolved.value,
      tier: 'binding' as const,
      canonicalOrder: [bindingIndex],
      provenance: { kind: 'binding' as const, bindingId: binding.id, source: resolved.source },
    }];
  });
}

export function stateContributionsV1(machineStates: readonly { readonly machine: projectFormatV1.StateMachine; readonly stateId: Id }[]): readonly PropertyContributionV1[] {
  return machineStates.flatMap(({ machine, stateId }, machineIndex) =>
    stateMachineValuesV1(machine, stateId).map((stateValue, valueIndex) => ({
      target: stateValue.target,
      value: stateValue.value,
      tier: 'state' as const,
      canonicalOrder: [machineIndex, valueIndex],
      provenance: { kind: 'state' as const, stateMachineId: machine.id, stateId, stateValueId: stateValue.id },
    })),
  );
}

export function sequenceContributionsV1(activeSequences: readonly { readonly sequence: projectFormatV1.Sequence; readonly tick: number }[]): readonly PropertyContributionV1[] {
  const sequences = new Map(activeSequences.map(({ sequence }) => [sequence.id, sequence]));

  return activeSequences.flatMap(({ sequence, tick }, sequenceIndex) => {
    const sampled = sampleSequenceV1({ sequence, transportTick: tick, sequences });

    if (sampled.status === 'invalid' || sampled.value.kind === 'time-out-of-range') return [];

    return sampled.value.values.map((sample, valueIndex) => ({
      target: sample.target,
      value: sample.value,
      tier: 'sequence' as const,
      canonicalOrder: [sequenceIndex, valueIndex],
      provenance: { kind: 'sequence' as const, ...sample.provenance },
    }));
  });
}
