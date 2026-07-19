import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as projectFormatV1Runtime } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import type { ExpressionContextV1 } from './expression-eval';
import {
  initStateMachineV1,
  type StateMachineInputV1,
  type StateMachineStateV1,
  stateMachineValuesV1,
  stepStateMachineV1,
} from './state-machine';

type ExpressionAst = projectFormatV1.ExpressionAst;
type Id = projectFormatV1.Id;
type SequenceAction = projectFormatV1.SequenceAction;
type State = projectFormatV1.State;
type StateMachine = projectFormatV1.StateMachine;
type StateValue = projectFormatV1.StateValue;
type Transition = projectFormatV1.Transition;
type TransitionTrigger = projectFormatV1.TransitionTrigger;

const INITIAL_STATE_ID = createId('initial');
const SECOND_STATE_ID = createId('second');
const THIRD_STATE_ID = createId('third');
const UNKNOWN_STATE_ID = createId('unknown');
const EVENT_ID = createId('event');
const OTHER_EVENT_ID = createId('other-event');
const VIEW_MODEL_ID = createId('view-model');
const FIELD_ID = createId('field');
const EMPTY_CONTEXT: ExpressionContextV1 = {
  resolveField: () => undefined,
  resolveVariable: () => undefined,
};

function createId(value: string): Id {
  return projectFormatV1Runtime.idSchema.parse(value);
}

function createAction(name: string): SequenceAction {
  return { kind: 'stop-sequence', sequenceId: createId(`sequence-${name}`) };
}

function createState(options: {
  readonly id: Id;
  readonly values?: readonly StateValue[] | undefined;
  readonly entryActions?: readonly SequenceAction[] | undefined;
  readonly exitActions?: readonly SequenceAction[] | undefined;
}): State {
  return {
    id: options.id,
    name: String(options.id),
    values: options.values ?? [],
    entryActions: options.entryActions ?? [],
    exitActions: options.exitActions ?? [],
  };
}

function createTransition(options: {
  readonly id: string;
  readonly sourceStateId?: Id | undefined;
  readonly targetStateId?: Id | undefined;
  readonly trigger: TransitionTrigger;
  readonly guard?: ExpressionAst | undefined;
  readonly priority?: number | undefined;
  readonly actions?: readonly SequenceAction[] | undefined;
}): Transition {
  return {
    id: createId(options.id),
    sourceStateId: options.sourceStateId ?? INITIAL_STATE_ID,
    targetStateId: options.targetStateId ?? SECOND_STATE_ID,
    trigger: options.trigger,
    ...(options.guard === undefined ? {} : { guard: options.guard }),
    priority: options.priority ?? 0,
    actions: options.actions ?? [],
  };
}

function createMachine(
  options: {
    readonly states?: readonly State[] | undefined;
    readonly transitions?: readonly Transition[] | undefined;
    readonly initialStateId?: Id | undefined;
  } = {},
): StateMachine {
  return {
    id: createId('machine'),
    name: 'Machine',
    initialStateId: options.initialStateId ?? INITIAL_STATE_ID,
    states: options.states ?? [createState({ id: INITIAL_STATE_ID }), createState({ id: SECOND_STATE_ID })],
    transitions: options.transitions ?? [],
  };
}

function step(options: {
  readonly machine: StateMachine;
  readonly current?: StateMachineStateV1 | undefined;
  readonly input: StateMachineInputV1;
  readonly context?: ExpressionContextV1 | undefined;
}): ReturnType<typeof stepStateMachineV1> {
  return stepStateMachineV1({
    machine: options.machine,
    current: options.current ?? { stateId: INITIAL_STATE_ID, ticksInState: 0 },
    input: options.input,
    context: options.context ?? EMPTY_CONTEXT,
  });
}

describe('initStateMachineV1', () => {
  it('initializes at zero ticks and fires the initial state entry actions', () => {
    const entryAction = createAction('initial-entry');
    const machine = createMachine({
      states: [
        createState({ id: INITIAL_STATE_ID, entryActions: [entryAction] }),
        createState({ id: SECOND_STATE_ID }),
      ],
    });

    expect(initStateMachineV1(machine)).toEqual({
      state: { stateId: INITIAL_STATE_ID, ticksInState: 0 },
      firedActions: [entryAction],
      transitioned: true,
    });
  });

  it('initializes with no actions when the initial state id is absent', () => {
    const machine = createMachine({ initialStateId: UNKNOWN_STATE_ID });

    expect(initStateMachineV1(machine)).toEqual({
      state: { stateId: UNKNOWN_STATE_ID, ticksInState: 0 },
      firedActions: [],
      transitioned: true,
    });
  });
});

describe('stepStateMachineV1 trigger matching', () => {
  it('takes a matching event transition and fires exit, transition, and entry actions in order', () => {
    const exitAction = createAction('exit');
    const transitionAction = createAction('transition');
    const entryAction = createAction('entry');
    const machine = createMachine({
      states: [
        createState({ id: INITIAL_STATE_ID, exitActions: [exitAction] }),
        createState({ id: SECOND_STATE_ID, entryActions: [entryAction] }),
      ],
      transitions: [
        createTransition({
          id: 'event-transition',
          trigger: { kind: 'event', eventId: EVENT_ID },
          actions: [transitionAction],
        }),
      ],
    });

    expect(step({ machine, input: { kind: 'event', eventId: EVENT_ID } })).toEqual({
      state: { stateId: SECOND_STATE_ID, ticksInState: 0 },
      firedActions: [exitAction, transitionAction, entryAction],
      transitioned: true,
    });
  });

  it('keeps state and ticks for a non-matching event', () => {
    const machine = createMachine({
      transitions: [createTransition({ id: 'event-transition', trigger: { kind: 'event', eventId: EVENT_ID } })],
    });

    expect(
      step({
        machine,
        current: { stateId: INITIAL_STATE_ID, ticksInState: 4 },
        input: { kind: 'event', eventId: OTHER_EVENT_ID },
      }),
    ).toEqual({
      state: { stateId: INITIAL_STATE_ID, ticksInState: 4 },
      firedActions: [],
      transitioned: false,
    });
  });

  it.each(['in', 'hold', 'update', 'out'] as const)('matches the %s lifecycle phase', (phase) => {
    const machine = createMachine({
      transitions: [createTransition({ id: `lifecycle-${phase}`, trigger: { kind: 'lifecycle', phase } })],
    });

    expect(step({ machine, input: { kind: 'lifecycle', phase } }).transitioned).toBe(true);
  });

  it('accumulates ticks below an after threshold, fires at the threshold, and resets', () => {
    const machine = createMachine({
      transitions: [createTransition({ id: 'after', trigger: { kind: 'after', ticks: 10 } })],
    });
    const belowThreshold = step({ machine, input: { kind: 'tick', deltaTicks: 6 } });
    const atThreshold = step({
      machine,
      current: belowThreshold.state,
      input: { kind: 'tick', deltaTicks: 4 },
    });

    expect(belowThreshold).toEqual({
      state: { stateId: INITIAL_STATE_ID, ticksInState: 6 },
      firedActions: [],
      transitioned: false,
    });
    expect(atThreshold.state).toEqual({ stateId: SECOND_STATE_ID, ticksInState: 0 });
    expect(atThreshold.transitioned).toBe(true);
  });

  it('never decreases accumulated ticks after a negative tick input', () => {
    const machine = createMachine();

    expect(
      step({
        machine,
        current: { stateId: INITIAL_STATE_ID, ticksInState: 8 },
        input: { kind: 'tick', deltaTicks: -3 },
      }).state,
    ).toEqual({ stateId: INITIAL_STATE_ID, ticksInState: 8 });
  });

  it('enters a missing target id with no entry actions', () => {
    const machine = createMachine({
      transitions: [
        createTransition({
          id: 'missing-target',
          targetStateId: UNKNOWN_STATE_ID,
          trigger: { kind: 'event', eventId: EVENT_ID },
        }),
      ],
    });

    expect(step({ machine, input: { kind: 'event', eventId: EVENT_ID } })).toEqual({
      state: { stateId: UNKNOWN_STATE_ID, ticksInState: 0 },
      firedActions: [],
      transitioned: true,
    });
  });
});

describe('stepStateMachineV1 guards and deterministic selection', () => {
  it('takes a transition only when its guard resolves to boolean true', () => {
    const guards: readonly [ExpressionAst, boolean][] = [
      [{ kind: 'literal', value: { type: 'boolean', value: true } }, true],
      [{ kind: 'literal', value: { type: 'boolean', value: false } }, false],
      [{ kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID }, false],
      [{ kind: 'literal', value: { type: 'string', value: 'true' } }, false],
    ];

    for (const [guard, transitioned] of guards) {
      const machine = createMachine({
        transitions: [
          createTransition({
            id: `guard-${String(transitioned)}-${guard.kind}`,
            trigger: { kind: 'event', eventId: EVENT_ID },
            guard,
          }),
        ],
      });

      expect(step({ machine, input: { kind: 'event', eventId: EVENT_ID } }).transitioned).toBe(transitioned);
    }
  });

  it('chooses the enabled candidate with the numerically lowest priority', () => {
    const machine = createMachine({
      states: [
        createState({ id: INITIAL_STATE_ID }),
        createState({ id: SECOND_STATE_ID }),
        createState({ id: THIRD_STATE_ID }),
      ],
      transitions: [
        createTransition({
          id: 'higher-priority-number',
          targetStateId: SECOND_STATE_ID,
          trigger: { kind: 'event', eventId: EVENT_ID },
          priority: 8,
        }),
        createTransition({
          id: 'lower-priority-number',
          targetStateId: THIRD_STATE_ID,
          trigger: { kind: 'event', eventId: EVENT_ID },
          priority: 2,
        }),
      ],
    });

    expect(step({ machine, input: { kind: 'event', eventId: EVENT_ID } }).state.stateId).toBe(THIRD_STATE_ID);
  });

  it('breaks a residual priority tie by transition array order', () => {
    const machine = createMachine({
      states: [
        createState({ id: INITIAL_STATE_ID }),
        createState({ id: SECOND_STATE_ID }),
        createState({ id: THIRD_STATE_ID }),
      ],
      transitions: [
        createTransition({
          id: 'first',
          targetStateId: SECOND_STATE_ID,
          trigger: { kind: 'event', eventId: EVENT_ID },
          priority: 1,
        }),
        createTransition({
          id: 'second',
          targetStateId: THIRD_STATE_ID,
          trigger: { kind: 'event', eventId: EVENT_ID },
          priority: 1,
        }),
      ],
    });

    expect(step({ machine, input: { kind: 'event', eventId: EVENT_ID } }).state.stateId).toBe(SECOND_STATE_ID);
  });

  it('fires at most one transition without cascading from the target state', () => {
    const machine = createMachine({
      states: [
        createState({ id: INITIAL_STATE_ID }),
        createState({ id: SECOND_STATE_ID }),
        createState({ id: THIRD_STATE_ID }),
      ],
      transitions: [
        createTransition({ id: 'first', trigger: { kind: 'event', eventId: EVENT_ID } }),
        createTransition({
          id: 'cascade',
          sourceStateId: SECOND_STATE_ID,
          targetStateId: THIRD_STATE_ID,
          trigger: { kind: 'event', eventId: EVENT_ID },
        }),
      ],
    });

    expect(step({ machine, input: { kind: 'event', eventId: EVENT_ID } }).state.stateId).toBe(SECOND_STATE_ID);
  });
});

describe('stateMachineValuesV1', () => {
  it('returns the state values and an empty array for an unknown state', () => {
    const value: StateValue = {
      id: createId('state-value'),
      target: {
        entity: { projectId: createId('project'), entityKind: 'element', entityId: createId('element') },
        pointer: '/visible',
      },
      value: { type: 'boolean', value: true },
    };
    const machine = createMachine({
      states: [createState({ id: INITIAL_STATE_ID, values: [value] })],
    });

    expect(stateMachineValuesV1(machine, INITIAL_STATE_ID)).toEqual([value]);
    expect(stateMachineValuesV1(machine, UNKNOWN_STATE_ID)).toEqual([]);
  });
});
