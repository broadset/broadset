import { describe, expect, it } from 'vitest';

import { lifecycleDefinitionSchema, stateMachineSchema, transitionTriggerSchema } from './sequence';

const target = {
  entity: { projectId: 'project-1', documentId: 'document-1', entityKind: 'element', entityId: 'headline' },
  pointer: '/appearance/opacity',
} as const;

describe('lifecycle and state machines', () => {
  it('parses every typed transition trigger', () => {
    const triggers = [
      { kind: 'event', eventId: 'show' },
      { kind: 'lifecycle', phase: 'update' },
      { kind: 'after', ticks: 1 },
    ] as const;

    expect(triggers.map((trigger) => transitionTriggerSchema.parse(trigger))).toEqual(triggers);
    expect(transitionTriggerSchema.safeParse({ kind: 'after', ticks: 0 }).success).toBe(false);
  });

  it('parses document lifecycle with every stable action discriminant', () => {
    const lifecycle = {
      id: 'lifecycle',
      in: [{ kind: 'play-sequence', sequenceId: 'in', behavior: 'restart' }],
      hold: [{ kind: 'seek-sequence', sequenceId: 'hold', tick: 0 }],
      update: [{ kind: 'send-event', stateMachineId: 'visibility', eventId: 'refresh' }],
      out: [{ kind: 'stop-sequence', sequenceId: 'in' }],
    } as const;

    expect(lifecycleDefinitionSchema.parse(lifecycle)).toEqual(lifecycle);
    expect(
      lifecycleDefinitionSchema.safeParse({ ...lifecycle, out: [{ kind: 'unknown', sequenceId: 'in' }] }).success,
    ).toBe(false);
  });

  it('validates state references, local ids, priorities, and boolean literal guards', () => {
    const machine = {
      id: 'visibility',
      name: 'Visibility',
      initialStateId: 'hidden',
      states: [
        { id: 'hidden', name: 'Hidden', values: [], entryActions: [], exitActions: [] },
        {
          id: 'visible',
          name: 'Visible',
          values: [{ id: 'opacity', target, value: { type: 'number', value: 1 } }],
          entryActions: [],
          exitActions: [],
        },
      ],
      transitions: [
        {
          id: 'show',
          sourceStateId: 'hidden',
          targetStateId: 'visible',
          trigger: { kind: 'event', eventId: 'show' },
          guard: { kind: 'literal', value: { type: 'boolean', value: true } },
          priority: 0,
          actions: [{ kind: 'play-sequence', sequenceId: 'fade', behavior: 'restart' }],
        },
      ],
    } as const;

    expect(stateMachineSchema.parse(machine)).toEqual(machine);
    expect(stateMachineSchema.safeParse({ ...machine, initialStateId: 'missing' }).success).toBe(false);
    expect(stateMachineSchema.safeParse({ ...machine, states: [machine.states[0], machine.states[0]] }).success).toBe(
      false,
    );
    expect(
      stateMachineSchema.safeParse({
        ...machine,
        states: [
          machine.states[0],
          { ...machine.states[1], values: [machine.states[1].values[0], machine.states[1].values[0]] },
        ],
      }).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse({
        ...machine,
        transitions: [{ ...machine.transitions[0], targetStateId: 'missing' }],
      }).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse({
        ...machine,
        transitions: [
          { ...machine.transitions[0], guard: { kind: 'literal', value: { type: 'string', value: 'yes' } } },
        ],
      }).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse({
        ...machine,
        transitions: [
          {
            ...machine.transitions[0],
            guard: {
              kind: 'unary',
              operator: 'negate',
              operand: { kind: 'literal', value: { type: 'number', value: 1 } },
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate source-trigger-priority combinations', () => {
    const transition = {
      id: 'first',
      sourceStateId: 'idle',
      targetStateId: 'active',
      trigger: { kind: 'lifecycle', phase: 'in' },
      priority: 1,
      actions: [],
    } as const;
    const machine = {
      id: 'machine',
      name: 'Machine',
      initialStateId: 'idle',
      states: [
        { id: 'idle', name: 'Idle', values: [], entryActions: [], exitActions: [] },
        { id: 'active', name: 'Active', values: [], entryActions: [], exitActions: [] },
      ],
      transitions: [transition, { ...transition, id: 'second' }],
    } as const;

    expect(stateMachineSchema.safeParse(machine).success).toBe(false);
  });

  it('recursively rejects structurally invalid guards and accepts unresolved references', () => {
    const createMachine = (guard: unknown) => ({
      id: 'guard-machine',
      name: 'Guard machine',
      initialStateId: 'idle',
      states: [
        { id: 'idle', name: 'Idle', values: [], entryActions: [], exitActions: [] },
        { id: 'active', name: 'Active', values: [], entryActions: [], exitActions: [] },
      ],
      transitions: [
        {
          id: 'activate',
          sourceStateId: 'idle',
          targetStateId: 'active',
          trigger: { kind: 'event', eventId: 'activate' },
          guard,
          priority: 0,
          actions: [],
        },
      ],
    });
    const literal = (type: 'boolean' | 'number' | 'string', value: boolean | number | string) => ({
      kind: 'literal',
      value: { type, value },
    });
    const invalidGuards = [
      { kind: 'unary', operator: 'not', operand: literal('number', 1) },
      { kind: 'binary', operator: 'and', left: literal('number', 1), right: literal('boolean', true) },
      { kind: 'binary', operator: 'eq', left: literal('string', '1'), right: literal('number', 1) },
      { kind: 'binary', operator: 'lt', left: literal('boolean', false), right: literal('boolean', true) },
      { kind: 'binary', operator: 'add', left: literal('number', 1), right: literal('number', 2) },
      {
        kind: 'conditional',
        condition: literal('number', 1),
        whenTrue: literal('boolean', true),
        whenFalse: literal('boolean', false),
      },
      {
        kind: 'conditional',
        condition: literal('boolean', true),
        whenTrue: literal('boolean', true),
        whenFalse: literal('number', 0),
      },
      {
        kind: 'safe-function',
        functionId: 'lowercase',
        arguments: [literal('number', 1)],
      },
      {
        kind: 'safe-function',
        functionId: 'lowercase',
        arguments: [literal('string', 'text')],
      },
      { kind: 'get', source: literal('string', 'not-an-object'), fieldId: 'value' },
      {
        kind: 'index',
        source: { kind: 'field', viewModelId: 'unknown', fieldId: 'rows' },
        index: literal('number', 0.5),
      },
    ];

    for (const guard of invalidGuards) {
      expect(stateMachineSchema.safeParse(createMachine(guard)).success).toBe(false);
    }

    const unknownField = { kind: 'field', viewModelId: 'unknown', fieldId: 'flag' };
    const unknownVariable = { kind: 'variable', collectionId: 'unknown', variableId: 'flag' };
    const deferredGuards = [
      unknownField,
      unknownVariable,
      { kind: 'unary', operator: 'not', operand: unknownField },
      { kind: 'binary', operator: 'and', left: unknownVariable, right: literal('boolean', true) },
      { kind: 'binary', operator: 'eq', left: unknownField, right: literal('string', 'expected') },
      { kind: 'binary', operator: 'gte', left: unknownVariable, right: literal('number', 0) },
      {
        kind: 'conditional',
        condition: unknownField,
        whenTrue: literal('boolean', true),
        whenFalse: literal('boolean', false),
      },
      { kind: 'get', source: unknownField, fieldId: 'nested' },
      { kind: 'index', source: unknownField, index: { kind: 'literal', value: { type: 'integer', value: 0 } } },
      {
        kind: 'safe-function',
        functionId: 'coalesce',
        arguments: [unknownField, literal('boolean', false)],
      },
    ];

    for (const guard of deferredGuards) {
      expect(stateMachineSchema.safeParse(createMachine(guard)).success).toBe(true);
    }

    expect(
      stateMachineSchema.safeParse(
        createMachine({ kind: 'binary', operator: 'and', left: unknownField, right: literal('number', 1) }),
      ).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse(
        createMachine({ kind: 'binary', operator: 'add', left: unknownField, right: literal('number', 1) }),
      ).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse(
        createMachine({
          kind: 'unary',
          operator: 'not',
          operand: { kind: 'binary', operator: 'add', left: unknownField, right: literal('number', 1) },
        }),
      ).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse(
        createMachine({
          kind: 'conditional',
          condition: literal('boolean', true),
          whenTrue: literal('number', 1),
          whenFalse: unknownField,
        }),
      ).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse(
        createMachine({
          kind: 'safe-function',
          functionId: 'coalesce',
          arguments: [unknownField, literal('number', 1)],
        }),
      ).success,
    ).toBe(false);
  });

  it('uses collision-safe structured transition priority identity for colon-containing ids', () => {
    const createTransition = (id: string, sourceStateId: string, eventId: string) => ({
      id,
      sourceStateId,
      targetStateId: 'target',
      trigger: { kind: 'event', eventId },
      priority: 0,
      actions: [],
    });
    const machine = {
      id: 'colon-machine',
      name: 'Colon machine',
      initialStateId: 'a',
      states: [
        { id: 'a', name: 'A', values: [], entryActions: [], exitActions: [] },
        { id: 'a:event:b', name: 'A event B', values: [], entryActions: [], exitActions: [] },
        { id: 'target', name: 'Target', values: [], entryActions: [], exitActions: [] },
      ],
      transitions: [createTransition('first', 'a', 'b:event:c'), createTransition('second', 'a:event:b', 'c')],
    };

    expect(stateMachineSchema.safeParse(machine).success).toBe(true);
    expect(
      stateMachineSchema.safeParse({
        ...machine,
        transitions: [machine.transitions[0], { ...machine.transitions[0], id: 'duplicate' }],
      }).success,
    ).toBe(false);
  });

  it('types literal object get and list index guards through nested access', () => {
    const createMachine = (guard: unknown) => ({
      id: 'literal-access-machine',
      name: 'Literal access machine',
      initialStateId: 'idle',
      states: [
        { id: 'idle', name: 'Idle', values: [], entryActions: [], exitActions: [] },
        { id: 'active', name: 'Active', values: [], entryActions: [], exitActions: [] },
      ],
      transitions: [
        {
          id: 'activate',
          sourceStateId: 'idle',
          targetStateId: 'active',
          trigger: { kind: 'event', eventId: 'activate' },
          guard,
          priority: 0,
          actions: [],
        },
      ],
    });
    const booleanValue = { type: 'boolean', value: true } as const;
    const numberValue = { type: 'number', value: 1 } as const;
    const unknownIndex = { kind: 'field', viewModelId: 'external', fieldId: 'index' } as const;
    const objectLiteral = {
      kind: 'literal',
      value: { type: 'object', fields: { enabled: booleanValue, count: numberValue } },
    } as const;
    const booleanListLiteral = {
      kind: 'literal',
      value: { type: 'list', items: [booleanValue, { type: 'boolean', value: false }] },
    } as const;
    const numericListLiteral = {
      kind: 'literal',
      value: { type: 'list', items: [numberValue, { type: 'integer', value: 2 }] },
    } as const;
    const heterogeneousListLiteral = {
      kind: 'literal',
      value: { type: 'list', items: [booleanValue, numberValue] },
    } as const;
    const nestedLiteral = {
      kind: 'literal',
      value: {
        type: 'object',
        fields: {
          rows: {
            type: 'list',
            items: [{ type: 'object', fields: { visible: booleanValue, opacity: numberValue } }],
          },
        },
      },
    } as const;
    const get = (source: unknown, fieldId: string) => ({ kind: 'get', source, fieldId });
    const index = (source: unknown, itemIndex: unknown) => ({ kind: 'index', source, index: itemIndex });
    const integerIndex = (value: number) => ({ kind: 'literal', value: { type: 'integer', value } });

    expect(stateMachineSchema.safeParse(createMachine(get(objectLiteral, 'enabled'))).success).toBe(true);
    expect(stateMachineSchema.safeParse(createMachine(get(objectLiteral, 'count'))).success).toBe(false);
    expect(stateMachineSchema.safeParse(createMachine(index(booleanListLiteral, integerIndex(0)))).success).toBe(true);
    expect(stateMachineSchema.safeParse(createMachine(index(numericListLiteral, integerIndex(1)))).success).toBe(false);

    const firstRow = index(get(nestedLiteral, 'rows'), integerIndex(0));

    expect(stateMachineSchema.safeParse(createMachine(get(firstRow, 'visible'))).success).toBe(true);
    expect(stateMachineSchema.safeParse(createMachine(get(firstRow, 'opacity'))).success).toBe(false);
    expect(stateMachineSchema.safeParse(createMachine(index(booleanListLiteral, unknownIndex))).success).toBe(true);
    expect(stateMachineSchema.safeParse(createMachine(index(numericListLiteral, unknownIndex))).success).toBe(false);
    expect(stateMachineSchema.safeParse(createMachine(index(heterogeneousListLiteral, unknownIndex))).success).toBe(
      true,
    );
    expect(stateMachineSchema.safeParse(createMachine(index(booleanListLiteral, integerIndex(2)))).success).toBe(false);
    expect(stateMachineSchema.safeParse(createMachine(get(objectLiteral, 'missing'))).success).toBe(false);
    expect(
      stateMachineSchema.safeParse(
        createMachine(index(booleanListLiteral, { kind: 'literal', value: { type: 'number', value: 0.5 } })),
      ).success,
    ).toBe(false);
  });
});
