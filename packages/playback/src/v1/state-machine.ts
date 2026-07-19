import type { projectFormatV1 } from '@broadset/model';

import { evaluateExpressionV1, type ExpressionContextV1 } from './expression-eval';

type StateMachine = projectFormatV1.StateMachine;
type State = projectFormatV1.State;
type StateValue = projectFormatV1.StateValue;
type SequenceAction = projectFormatV1.SequenceAction;
type Transition = projectFormatV1.Transition;
type Id = projectFormatV1.Id;

export interface StateMachineStateV1 {
  readonly stateId: Id;
  readonly ticksInState: number;
}

export type StateMachineInputV1 =
  | { readonly kind: 'event'; readonly eventId: Id }
  | { readonly kind: 'lifecycle'; readonly phase: 'in' | 'hold' | 'update' | 'out' }
  | { readonly kind: 'tick'; readonly deltaTicks: number };

export interface StateMachineStepResultV1 {
  readonly state: StateMachineStateV1;
  readonly firedActions: readonly SequenceAction[];
  readonly transitioned: boolean;
}

function findState(machine: StateMachine, stateId: Id): State | undefined {
  return machine.states.find((state) => state.id === stateId);
}

function triggerMatches(transition: Transition, current: StateMachineStateV1, input: StateMachineInputV1): boolean {
  switch (input.kind) {
    case 'event':
      return transition.trigger.kind === 'event' && transition.trigger.eventId === input.eventId;
    case 'lifecycle':
      return transition.trigger.kind === 'lifecycle' && transition.trigger.phase === input.phase;
    case 'tick':
      return transition.trigger.kind === 'after' && current.ticksInState + input.deltaTicks >= transition.trigger.ticks;
  }
}

function guardAllows(transition: Transition, context: ExpressionContextV1): boolean {
  if (transition.guard === undefined) return true;

  const value = evaluateExpressionV1(transition.guard, context);

  return value?.type === 'boolean' && value.value;
}

function chooseTransition(options: {
  readonly machine: StateMachine;
  readonly current: StateMachineStateV1;
  readonly input: StateMachineInputV1;
  readonly context: ExpressionContextV1;
}): Transition | undefined {
  let chosen: Transition | undefined;

  for (const transition of options.machine.transitions) {
    if (transition.sourceStateId !== options.current.stateId) continue;
    if (!triggerMatches(transition, options.current, options.input)) continue;
    if (!guardAllows(transition, options.context)) continue;
    if (chosen === undefined || transition.priority < chosen.priority) chosen = transition;
  }

  return chosen;
}

export function initStateMachineV1(machine: StateMachine): StateMachineStepResultV1 {
  const initialState = findState(machine, machine.initialStateId);

  return {
    state: { stateId: machine.initialStateId, ticksInState: 0 },
    firedActions: initialState?.entryActions ?? [],
    transitioned: true,
  };
}

export function stateMachineValuesV1(machine: StateMachine, stateId: Id): readonly StateValue[] {
  return findState(machine, stateId)?.values ?? [];
}

export function stepStateMachineV1(options: {
  readonly machine: StateMachine;
  readonly current: StateMachineStateV1;
  readonly input: StateMachineInputV1;
  readonly context: ExpressionContextV1;
}): StateMachineStepResultV1 {
  const transition = chooseTransition(options);

  if (transition !== undefined) {
    const source = findState(options.machine, options.current.stateId);
    const target = findState(options.machine, transition.targetStateId);

    return {
      state: { stateId: transition.targetStateId, ticksInState: 0 },
      firedActions: [...(source?.exitActions ?? []), ...transition.actions, ...(target?.entryActions ?? [])],
      transitioned: true,
    };
  }

  return {
    state: {
      stateId: options.current.stateId,
      ticksInState:
        options.input.kind === 'tick' ?
          options.current.ticksInState + Math.max(0, options.input.deltaTicks)
        : options.current.ticksInState,
    },
    firedActions: [],
    transitioned: false,
  };
}
