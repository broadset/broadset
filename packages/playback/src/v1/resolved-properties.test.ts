import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as projectFormatV1Runtime } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import type { ExpressionContextV1 } from './expression-eval';
import {
  bindingContributionsV1,
  type PropertyContributionV1,
  propertyTargetKeyV1,
  resolvePropertyMapV1,
  sequenceContributionsV1,
  stateContributionsV1,
} from './resolved-properties';

type Binding = projectFormatV1.Binding;
type Id = projectFormatV1.Id;
type PropertyTarget = projectFormatV1.PropertyTarget;
type Sequence = projectFormatV1.Sequence;
type StateMachine = projectFormatV1.StateMachine;
type TypedValue = projectFormatV1.TypedValue;

const PROJECT_ID = createId('project');
const DOCUMENT_ID = createId('document');
const PAGE_ID = createId('page');
const ELEMENT_ID = createId('element');
const MACHINE_ID = createId('machine');
const STATE_ID = createId('state');
const SEQUENCE_ID = createId('sequence');
const BINDING_ID = createId('binding');
const STATE_VALUE_ID = createId('state-value');
const TRACK_ID = createId('track');
const KEYFRAME_ID = createId('keyframe');
const TARGET: PropertyTarget = {
  entity: {
    projectId: PROJECT_ID,
    documentId: DOCUMENT_ID,
    pageId: PAGE_ID,
    entityKind: 'element',
    entityId: ELEMENT_ID,
    instancePath: [createId('instance')],
  },
  pointer: '/style/opacity',
};
const OTHER_TARGET: PropertyTarget = { ...TARGET, pointer: '/visible' };
const EMPTY_CONTEXT: ExpressionContextV1 = {
  resolveField: () => undefined,
  resolveVariable: () => undefined,
};

function createId(value: string): Id {
  return projectFormatV1Runtime.idSchema.parse(value);
}

function createContribution(options: {
  readonly target?: PropertyTarget | undefined;
  readonly value: TypedValue;
  readonly provenance: PropertyContributionV1['provenance'];
  readonly canonicalOrder?: readonly number[] | undefined;
}): PropertyContributionV1 {
  return {
    target: options.target ?? TARGET,
    value: options.value,
    tier: options.provenance.kind,
    canonicalOrder: options.canonicalOrder ?? [0],
    provenance: options.provenance,
  };
}

function createBinding(options: {
  readonly id?: Id | undefined;
  readonly target?: PropertyTarget | undefined;
  readonly value?: TypedValue | undefined;
  readonly unresolved?: boolean | undefined;
} = {}): Binding {
  return {
    id: options.id ?? BINDING_ID,
    target: options.target ?? TARGET,
    expression:
      options.unresolved === true
        ? { kind: 'field', viewModelId: createId('view-model'), fieldId: createId('field') }
        : { kind: 'literal', value: options.value ?? { type: 'number', value: 1 } },
  };
}

function createStateMachine(values: readonly projectFormatV1.StateValue[]): StateMachine {
  return {
    id: MACHINE_ID,
    name: 'Machine',
    initialStateId: STATE_ID,
    states: [
      {
        id: STATE_ID,
        name: 'State',
        values,
        entryActions: [],
        exitActions: [],
      },
    ],
    transitions: [],
  };
}

function createSequence(options: {
  readonly id?: Id | undefined;
  readonly target?: PropertyTarget | undefined;
  readonly value?: TypedValue | undefined;
} = {}): Sequence {
  const value = options.value ?? { type: 'number', value: 3 };

  return {
    id: options.id ?? SEQUENCE_ID,
    name: 'Sequence',
    durationTicks: 10,
    loop: { kind: 'none' },
    tracks: [
      {
        id: createId(`track-${String(options.id ?? SEQUENCE_ID)}`),
        name: 'Track',
        target: options.target ?? TARGET,
        valueType: value.type,
        keyframes: [{ id: createId(`keyframe-${String(options.id ?? SEQUENCE_ID)}`), tick: 0, value }],
      },
    ],
    markers: [],
    cues: [],
    childClips: [],
  };
}

describe('propertyTargetKeyV1', () => {
  it('returns the same key for identical targets', () => {
    const identical: PropertyTarget = {
      entity: { ...TARGET.entity, instancePath: [...(TARGET.entity.instancePath ?? [])] },
      pointer: TARGET.pointer,
    };

    expect(propertyTargetKeyV1(identical)).toBe(propertyTargetKeyV1(TARGET));
  });

  it('serializes every address field before the pointer with the mandated separators', () => {
    expect(propertyTargetKeyV1(TARGET)).toBe(
      `project\u0000document\u0000page\u0000element\u0000element\u0000instance\u0000/style/opacity`,
    );
  });

  it.each([
    ['pointer', { ...TARGET, pointer: '/style/fill' }],
    ['entity id', { ...TARGET, entity: { ...TARGET.entity, entityId: createId('other-element') } }],
    ['document id presence', { ...TARGET, entity: { ...TARGET.entity, documentId: undefined } }],
    ['page id', { ...TARGET, entity: { ...TARGET.entity, pageId: createId('other-page') } }],
  ])('distinguishes targets differing only by %s', (_field, target) => {
    expect(propertyTargetKeyV1(target)).not.toBe(propertyTargetKeyV1(TARGET));
  });

  it('normalizes absent and empty instance paths while distinguishing populated paths', () => {
    const absent: PropertyTarget = { ...TARGET, entity: { ...TARGET.entity, instancePath: undefined } };
    const empty: PropertyTarget = { ...TARGET, entity: { ...TARGET.entity, instancePath: [] } };
    const one: PropertyTarget = { ...TARGET, entity: { ...TARGET.entity, instancePath: [createId('a')] } };
    const two: PropertyTarget = {
      ...TARGET,
      entity: { ...TARGET.entity, instancePath: [createId('a'), createId('b')] },
    };

    expect(new Set([absent, empty, one, two].map(propertyTargetKeyV1))).toHaveLength(3);
    expect(propertyTargetKeyV1(one)).not.toBe(propertyTargetKeyV1(two));
  });
});

describe('resolvePropertyMapV1', () => {
  it('resolves binding, state, and sequence precedence with ordered provenance', () => {
    const binding = createContribution({
      value: { type: 'number', value: 1 },
      provenance: { kind: 'binding', bindingId: BINDING_ID, source: 'expression' },
    });
    const state = createContribution({
      value: { type: 'number', value: 2 },
      provenance: { kind: 'state', stateMachineId: MACHINE_ID, stateId: STATE_ID, stateValueId: STATE_VALUE_ID },
    });
    const sequence = createContribution({
      value: { type: 'number', value: 3 },
      provenance: { kind: 'sequence', sequenceId: SEQUENCE_ID, trackId: TRACK_ID, fromKeyframeId: KEYFRAME_ID, childClipPath: [] },
    });
    const key = propertyTargetKeyV1(TARGET);

    expect(resolvePropertyMapV1([binding]).get(key)).toEqual({ target: TARGET, value: binding.value, provenance: binding.provenance, overridden: [] });
    expect(resolvePropertyMapV1([binding, state]).get(key)).toEqual({
      target: TARGET,
      value: state.value,
      provenance: state.provenance,
      overridden: [{ value: binding.value, provenance: binding.provenance }],
    });

    expect(resolvePropertyMapV1([binding, state, sequence]).get(key)).toEqual({
      target: TARGET,
      value: sequence.value,
      provenance: sequence.provenance,
      overridden: [{ value: binding.value, provenance: binding.provenance }, { value: state.value, provenance: state.provenance }],
    });
  });

  it('keeps independent targets and contributions without competitors', () => {
    const binding = createContribution({
      value: { type: 'boolean', value: true },
      provenance: { kind: 'binding', bindingId: BINDING_ID, source: 'expression' },
    });
    const sequence = createContribution({
      target: OTHER_TARGET,
      value: { type: 'boolean', value: false },
      provenance: { kind: 'sequence', sequenceId: SEQUENCE_ID, trackId: TRACK_ID, fromKeyframeId: KEYFRAME_ID, childClipPath: [] },
    });
    const resolved = resolvePropertyMapV1([binding, sequence]);

    expect(resolved).toHaveLength(2);
    expect(resolved.get(propertyTargetKeyV1(TARGET))).toEqual({ target: TARGET, value: binding.value, provenance: binding.provenance, overridden: [] });
    expect(resolved.get(propertyTargetKeyV1(OTHER_TARGET))).toEqual({ target: OTHER_TARGET, value: sequence.value, provenance: sequence.provenance, overridden: [] });
  });

  it('uses canonical order rather than caller order for conflicts within one tier', () => {
    const firstSequenceId = createId('first-sequence');
    const secondSequenceId = createId('second-sequence');
    const first = createContribution({
      value: { type: 'string', value: 'first' },
      provenance: { kind: 'sequence', sequenceId: firstSequenceId, trackId: TRACK_ID, fromKeyframeId: KEYFRAME_ID, childClipPath: [] },
      canonicalOrder: [0],
    });
    const second = createContribution({
      value: { type: 'string', value: 'second' },
      provenance: { kind: 'sequence', sequenceId: secondSequenceId, trackId: TRACK_ID, fromKeyframeId: KEYFRAME_ID, childClipPath: [] },
      canonicalOrder: [1],
    });

    const expected = {
      target: TARGET,
      value: second.value,
      provenance: second.provenance,
      overridden: [{ value: first.value, provenance: first.provenance }],
    };

    expect(resolvePropertyMapV1([first, second]).get(propertyTargetKeyV1(TARGET))).toEqual(expected);
    expect(resolvePropertyMapV1([second, first]).get(propertyTargetKeyV1(TARGET))).toEqual(expected);
  });
});

describe('resolved property contribution gatherers', () => {
  it('skips unresolved bindings and tags resolved bindings', () => {
    const resolvedBinding = createBinding({ value: { type: 'string', value: 'resolved' } });
    const unresolvedBinding = createBinding({ id: createId('unresolved-binding'), unresolved: true });

    expect(bindingContributionsV1([resolvedBinding, unresolvedBinding], EMPTY_CONTEXT)).toEqual([
      {
        target: TARGET,
        value: { type: 'string', value: 'resolved' },
        tier: 'binding',
        canonicalOrder: [0],
        provenance: { kind: 'binding', bindingId: BINDING_ID, source: 'expression' },
      },
    ]);
  });

  it('expands state values and tags their machine and state ids', () => {
    const firstValue = {
      id: createId('first-state-value'),
      target: TARGET,
      value: { type: 'number', value: 1 },
    } as const;
    const secondValue = {
      id: createId('second-state-value'),
      target: OTHER_TARGET,
      value: { type: 'boolean', value: true },
    } as const;
    const machine = createStateMachine([firstValue, secondValue]);

    expect(stateContributionsV1([{ machine, stateId: STATE_ID }])).toEqual([
      {
        target: TARGET,
        value: firstValue.value,
        tier: 'state',
        canonicalOrder: [0, 0],
        provenance: { kind: 'state', stateMachineId: MACHINE_ID, stateId: STATE_ID, stateValueId: firstValue.id },
      },
      {
        target: OTHER_TARGET,
        value: secondValue.value,
        tier: 'state',
        canonicalOrder: [0, 1],
        provenance: { kind: 'state', stateMachineId: MACHINE_ID, stateId: STATE_ID, stateValueId: secondValue.id },
      },
    ]);
  });

  it('samples each active sequence and tags its sequence id', () => {
    const firstSequence = createSequence({ value: { type: 'number', value: 7 } });
    const secondSequenceId = createId('other-sequence');
    const secondSequence = createSequence({
      id: secondSequenceId,
      target: OTHER_TARGET,
      value: { type: 'boolean', value: true },
    });

    expect(
      sequenceContributionsV1([
        { sequence: firstSequence, tick: 0 },
        { sequence: secondSequence, tick: 5 },
      ]),
    ).toEqual([
      {
        target: TARGET,
        value: { type: 'number', value: 7 },
        tier: 'sequence',
        canonicalOrder: [0, 0],
        provenance: { kind: 'sequence', sequenceId: SEQUENCE_ID, trackId: createId('track-sequence'), fromKeyframeId: createId('keyframe-sequence'), childClipPath: [] },
      },
      {
        target: OTHER_TARGET,
        value: { type: 'boolean', value: true },
        tier: 'sequence',
        canonicalOrder: [1, 0],
        provenance: { kind: 'sequence', sequenceId: secondSequenceId, trackId: createId('track-other-sequence'), fromKeyframeId: createId('keyframe-other-sequence'), childClipPath: [] },
      },
    ]);
  });
});

describe('resolved property evaluation', () => {
  it('makes the sequence value effective over binding and state values', () => {
    const binding = createBinding({ value: { type: 'number', value: 1 } });
    const machine = createStateMachine([
      {
        id: createId('state-value'),
        target: TARGET,
        value: { type: 'number', value: 2 },
      },
    ]);
    const sequence = createSequence({ value: { type: 'number', value: 3 } });
    const contributions = [
      ...bindingContributionsV1([binding], EMPTY_CONTEXT),
      ...stateContributionsV1([{ machine, stateId: STATE_ID }]),
      ...sequenceContributionsV1([{ sequence, tick: 0 }]),
    ];

    expect(resolvePropertyMapV1(contributions).get(propertyTargetKeyV1(TARGET))).toEqual({
      target: TARGET,
      value: { type: 'number', value: 3 },
      provenance: { kind: 'sequence', sequenceId: SEQUENCE_ID, trackId: createId('track-sequence'), fromKeyframeId: createId('keyframe-sequence'), childClipPath: [] },
      overridden: [
        { value: { type: 'number', value: 1 }, provenance: { kind: 'binding', bindingId: BINDING_ID, source: 'expression' } },
        { value: { type: 'number', value: 2 }, provenance: { kind: 'state', stateMachineId: MACHINE_ID, stateId: STATE_ID, stateValueId: createId('state-value') } },
      ],
    });
  });
});
