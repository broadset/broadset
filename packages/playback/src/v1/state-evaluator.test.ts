import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as model } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import type { ExpressionContextV1 } from './expression-eval';
import { deriveStateSnapshotV1, evaluateStateMachineAtTickV1, type RuntimeStateEventV1 } from './state-evaluator';

type Id = projectFormatV1.Id;
type StateMachine = projectFormatV1.StateMachine;

const id = (value: string): Id => model.idSchema.parse(value);
const MACHINE_ID = id('machine');
const INITIAL_ID = id('initial');
const ACTIVE_ID = id('active');
const EVENT_ID = id('activate');
const EMPTY_CONTEXT: ExpressionContextV1 = { resolveField: () => undefined, resolveVariable: () => undefined };

function machine(): StateMachine {
  return {
    id: MACHINE_ID,
    name: 'Machine',
    initialStateId: INITIAL_ID,
    states: [
      { id: INITIAL_ID, name: 'Initial', values: [], entryActions: [], exitActions: [] },
      { id: ACTIVE_ID, name: 'Active', values: [], entryActions: [], exitActions: [] },
    ],
    transitions: [
      {
        id: id('activate-transition'),
        sourceStateId: INITIAL_ID,
        targetStateId: ACTIVE_ID,
        trigger: { kind: 'event', eventId: EVENT_ID },
        priority: 0,
        actions: [{ kind: 'play-sequence', sequenceId: id('active-sequence'), behavior: 'restart' }],
      },
    ],
  };
}

function event(tick: number): RuntimeStateEventV1 {
  return { id: id(`event-${String(tick)}`), tick, stateMachineId: MACHINE_ID, input: { kind: 'event', eventId: EVENT_ID } };
}

describe('evaluateStateMachineAtTickV1', () => {
  it('cold-evaluates direct, forward, and backward seeks equivalently without mutating events', () => {
    const events = [event(3)] as const;
    const before = structuredClone(events);
    const atTen = evaluateStateMachineAtTickV1({ machine: machine(), events, tick: 10, context: EMPTY_CONTEXT });

    evaluateStateMachineAtTickV1({ machine: machine(), events, tick: 2, context: EMPTY_CONTEXT });

    const atTenAgain = evaluateStateMachineAtTickV1({ machine: machine(), events, tick: 10, context: EMPTY_CONTEXT });

    expect(atTenAgain).toEqual(atTen);
    expect(events).toEqual(before);
    expect(atTen).toMatchObject({
      status: 'resolved',
      value: {
        tick: 10,
        machineStates: [{ stateMachineId: MACHINE_ID, stateId: ACTIVE_ID, enteredAtTick: 3 }],
        sequenceActions: [{ stateMachineId: MACHINE_ID, transitionId: id('activate-transition'), startTick: 3, actionIndex: 0 }],
      },
    });
  });

  it('fires an after transition at its exact eligible tick before a later event', () => {
    const delayed: StateMachine = {
      ...machine(),
      transitions: [{
        id: id('after'), sourceStateId: INITIAL_ID, targetStateId: ACTIVE_ID,
        trigger: { kind: 'after', ticks: 5 }, priority: 0, actions: [],
      }],
    };

    expect(evaluateStateMachineAtTickV1({ machine: delayed, events: [], tick: 4, context: EMPTY_CONTEXT })).toMatchObject({ value: { machineStates: [{ stateId: INITIAL_ID }] } });
    expect(evaluateStateMachineAtTickV1({ machine: delayed, events: [], tick: 5, context: EMPTY_CONTEXT })).toMatchObject({ value: { machineStates: [{ stateId: ACTIVE_ID, enteredAtTick: 5 }] } });
  });

  it('fires the chronologically earliest after transition before considering later priorities', () => {
    const thirdId = id('third');
    const timed: StateMachine = {
      ...machine(),
      states: [...machine().states, { id: thirdId, name: 'Third', values: [], entryActions: [], exitActions: [] }],
      transitions: [
        { id: id('early'), sourceStateId: INITIAL_ID, targetStateId: ACTIVE_ID, trigger: { kind: 'after', ticks: 5 }, priority: 10, actions: [] },
        { id: id('late'), sourceStateId: INITIAL_ID, targetStateId: thirdId, trigger: { kind: 'after', ticks: 10 }, priority: 0, actions: [] },
      ],
    };

    expect(evaluateStateMachineAtTickV1({ machine: timed, events: [], tick: 10, context: EMPTY_CONTEXT })).toMatchObject({
      value: { machineStates: [{ stateId: ACTIVE_ID, enteredAtTick: 5 }] },
    });
  });

  it('replays every positive-delay self transition through the requested tick', () => {
    const cycling: StateMachine = {
      ...machine(),
      states: [{ id: INITIAL_ID, name: 'Initial', values: [], entryActions: [], exitActions: [] }],
      transitions: [{
        id: id('cycle-after-one'),
        sourceStateId: INITIAL_ID,
        targetStateId: INITIAL_ID,
        trigger: { kind: 'after', ticks: 1 },
        priority: 0,
        actions: [],
      }],
    };

    expect(evaluateStateMachineAtTickV1({ machine: cycling, events: [], tick: 4, context: EMPTY_CONTEXT })).toMatchObject({
      status: 'resolved',
      value: { machineStates: [{ stateId: INITIAL_ID, enteredAtTick: 4 }] },
    });
  });

  it('returns diagnostics for a zero-delay after cycle instead of looping forever', () => {
    const cycling: StateMachine = {
      ...machine(),
      states: [{ id: INITIAL_ID, name: 'Initial', values: [], entryActions: [], exitActions: [] }],
      transitions: [{
        id: id('cycle-after-zero'),
        sourceStateId: INITIAL_ID,
        targetStateId: INITIAL_ID,
        trigger: { kind: 'after', ticks: 0 },
        priority: 0,
        actions: [],
      }],
    };

    expect(evaluateStateMachineAtTickV1({ machine: cycling, events: [], tick: 4, context: EMPTY_CONTEXT })).toMatchObject({
      status: 'invalid',
      diagnostics: [{ code: 'playback.zero-delay-state-cycle' }],
    });
  });

  it('uses same-tick input order and lowest transition priority deterministically', () => {
    const result = evaluateStateMachineAtTickV1({ machine: machine(), events: [event(1), event(1)], tick: 1, context: EMPTY_CONTEXT });

    expect(result).toMatchObject({ status: 'resolved', value: { machineStates: [{ stateId: ACTIVE_ID }] } });
  });

  it('returns diagnostics for future events and unsafe ticks', () => {
    expect(evaluateStateMachineAtTickV1({ machine: machine(), events: [event(5)], tick: 4, context: EMPTY_CONTEXT })).toMatchObject({ status: 'invalid' });
    expect(evaluateStateMachineAtTickV1({ machine: machine(), events: [], tick: -1, context: EMPTY_CONTEXT })).toMatchObject({ status: 'invalid' });
  });
});

describe('deriveStateSnapshotV1', () => {
  it('evaluates independent machines in canonical input order', () => {
    const second = { ...machine(), id: id('second-machine'), name: 'Second' };
    const result = deriveStateSnapshotV1({ machines: [machine(), second], eventLog: [], context: EMPTY_CONTEXT, tick: 0 });

    expect(result).toMatchObject({
      status: 'resolved',
      value: { machineStates: [{ stateMachineId: MACHINE_ID }, { stateMachineId: id('second-machine') }] },
    });
  });

  it('combines many scheduled actions without a variadic append overflow', () => {
    const actionCount = 130_000;
    const initial = machine().states[0];

    expect(initial).toBeDefined();
    if (initial === undefined) return;

    const wide: StateMachine = {
      ...machine(),
      states: [{
        ...initial,
        entryActions: Array.from({ length: actionCount }, () => ({ kind: 'stop-sequence' as const, sequenceId: id('wide-sequence') })),
      }],
      transitions: [],
    };
    const result = deriveStateSnapshotV1({ machines: [wide], eventLog: [], context: EMPTY_CONTEXT, tick: 0 });

    expect(result.status).toBe('resolved');
    expect(result.status === 'resolved' ? result.value.sequenceActions.length : 0).toBe(actionCount);
  });
});
