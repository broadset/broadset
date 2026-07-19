import type { projectFormatV1 } from '@broadset/model';

import { invalidEvaluationV1, type PlaybackEvaluationResultV1, resolvedEvaluationV1 } from './evaluation-result';
import { evaluateExpressionV1, type ExpressionContextV1 } from './expression-eval';
import type { StateMachineInputV1 } from './state-machine';

export interface RuntimeStateEventV1 {
  readonly id: projectFormatV1.Id;
  readonly tick: number;
  readonly stateMachineId: projectFormatV1.Id;
  readonly input: Extract<StateMachineInputV1, { readonly kind: 'event' | 'lifecycle' }>;
}

export interface ScheduledSequenceActionV1 {
  readonly stateMachineId: projectFormatV1.Id;
  readonly transitionId?: projectFormatV1.Id | undefined;
  readonly eventId?: projectFormatV1.Id | undefined;
  readonly startTick: number;
  readonly actionIndex: number;
  readonly action: projectFormatV1.SequenceAction;
}

export interface DerivedMachineStateV1 {
  readonly stateMachineId: projectFormatV1.Id;
  readonly stateId: projectFormatV1.Id;
  readonly enteredAtTick: number;
}

export interface DerivedStateSnapshotV1 {
  readonly tick: number;
  readonly machineStates: readonly DerivedMachineStateV1[];
  readonly sequenceActions: readonly ScheduledSequenceActionV1[];
}

interface ReplayState {
  readonly stateId: projectFormatV1.Id;
  readonly enteredAtTick: number;
  readonly sequenceActions: readonly ScheduledSequenceActionV1[];
}

function guardAllows(transition: projectFormatV1.Transition, context: ExpressionContextV1): boolean {
  if (transition.guard === undefined) return true;

  const result = evaluateExpressionV1(transition.guard, context);

  return result?.type === 'boolean' && result.value;
}

function chooseTransition(options: {
  readonly machine: projectFormatV1.StateMachine;
  readonly stateId: projectFormatV1.Id;
  readonly input: StateMachineInputV1;
  readonly ticksInState: number;
  readonly context: ExpressionContextV1;
}): projectFormatV1.Transition | undefined {
  let chosen: projectFormatV1.Transition | undefined;

  for (const transition of options.machine.transitions) {
    if (transition.sourceStateId !== options.stateId || !guardAllows(transition, options.context)) continue;

    const matches = triggerMatches({ transition, input: options.input, ticksInState: options.ticksInState });

    if (!matches) continue;
    if (chosen === undefined || transition.priority < chosen.priority) chosen = transition;
  }

  return chosen;
}

function triggerMatches(options: {
  readonly transition: projectFormatV1.Transition;
  readonly input: StateMachineInputV1;
  readonly ticksInState: number;
}): boolean {
  const trigger = options.transition.trigger;

  if (options.input.kind === 'event') return trigger.kind === 'event' && trigger.eventId === options.input.eventId;
  if (options.input.kind === 'lifecycle') return trigger.kind === 'lifecycle' && trigger.phase === options.input.phase;

  return trigger.kind === 'after' && options.ticksInState >= trigger.ticks;
}

function scheduleActions(options: {
  readonly machineId: projectFormatV1.Id;
  readonly transitionId?: projectFormatV1.Id | undefined;
  readonly eventId?: projectFormatV1.Id | undefined;
  readonly tick: number;
  readonly actions: readonly projectFormatV1.SequenceAction[];
}): readonly ScheduledSequenceActionV1[] {
  return options.actions.map((action, actionIndex) => ({
    stateMachineId: options.machineId,
    ...(options.transitionId === undefined ? {} : { transitionId: options.transitionId }),
    ...(options.eventId === undefined ? {} : { eventId: options.eventId }),
    startTick: options.tick,
    actionIndex,
    action,
  }));
}

function takeTransition(options: {
  readonly machine: projectFormatV1.StateMachine;
  readonly replay: ReplayState;
  readonly transition: projectFormatV1.Transition;
  readonly tick: number;
  readonly eventId?: projectFormatV1.Id | undefined;
}): ReplayState {
  const source = options.machine.states.find((state) => state.id === options.replay.stateId);
  const target = options.machine.states.find((state) => state.id === options.transition.targetStateId);
  const actions = [...(source?.exitActions ?? []), ...options.transition.actions, ...(target?.entryActions ?? [])];

  return {
    stateId: options.transition.targetStateId,
    enteredAtTick: options.tick,
    sequenceActions: [
      ...options.replay.sequenceActions,
      ...scheduleActions({
        machineId: options.machine.id,
        transitionId: options.transition.id,
        eventId: options.eventId,
        tick: options.tick,
        actions,
      }),
    ],
  };
}

function nextAfterTransition(options: {
  readonly machine: projectFormatV1.StateMachine;
  readonly replay: ReplayState;
  readonly maximumTick: number;
  readonly context: ExpressionContextV1;
}): { readonly transition: projectFormatV1.Transition; readonly tick: number } | undefined {
  const candidates = options.machine.transitions.filter((transition) =>
    transition.sourceStateId === options.replay.stateId
    && transition.trigger.kind === 'after'
    && guardAllows(transition, options.context)
    && options.replay.enteredAtTick + transition.trigger.ticks <= options.maximumTick,
  );
  let chosen: projectFormatV1.Transition | undefined;

  for (const candidate of candidates) {
    if (chosen === undefined) {
      chosen = candidate;
      continue;
    }

    if (candidate.trigger.kind !== 'after' || chosen.trigger.kind !== 'after') continue;

    const candidateTick = options.replay.enteredAtTick + candidate.trigger.ticks;
    const chosenTick = options.replay.enteredAtTick + chosen.trigger.ticks;

    if (candidateTick < chosenTick || (candidateTick === chosenTick && candidate.priority < chosen.priority)) chosen = candidate;
  }

  if (chosen?.trigger.kind !== 'after') return undefined;

  return { transition: chosen, tick: options.replay.enteredAtTick + chosen.trigger.ticks };
}

function advanceAfterTransitions(options: {
  readonly machine: projectFormatV1.StateMachine;
  readonly replay: ReplayState;
  readonly maximumTick: number;
  readonly context: ExpressionContextV1;
}): PlaybackEvaluationResultV1<ReplayState> {
  let replay = options.replay;
  const visited = new Set<string>();

  for (;;) {
    const replayKey = `${String(replay.stateId)}\u0000${String(replay.enteredAtTick)}`;

    if (visited.has(replayKey)) {
      return invalidEvaluationV1({
        code: 'playback.zero-delay-state-cycle',
        message: `State machine ${String(options.machine.id)} contains an eligible zero-delay after-transition cycle.`,
      });
    }

    visited.add(replayKey);

    const next = nextAfterTransition({ ...options, replay });

    if (next === undefined) return resolvedEvaluationV1(replay);
    replay = takeTransition({ machine: options.machine, replay, transition: next.transition, tick: next.tick });
  }
}

export function evaluateStateMachineAtTickV1(options: {
  readonly machine: projectFormatV1.StateMachine;
  readonly events: readonly RuntimeStateEventV1[];
  readonly tick: number;
  readonly context: ExpressionContextV1;
}): PlaybackEvaluationResultV1<DerivedStateSnapshotV1> {
  if (!Number.isSafeInteger(options.tick) || options.tick < 0) return invalidEvaluationV1({ code: 'playback.invalid-tick', message: 'State evaluation tick must be a non-negative safe integer.' });

  if (options.events.some((event) => !Number.isSafeInteger(event.tick) || event.tick < 0 || event.tick > options.tick)) {
    return invalidEvaluationV1({ code: 'playback.invalid-event-tick', message: 'Runtime events must use safe ticks no later than the evaluation tick.' });
  }

  const initial = options.machine.states.find((state) => state.id === options.machine.initialStateId);
  let replay: ReplayState = {
    stateId: options.machine.initialStateId,
    enteredAtTick: 0,
    sequenceActions: scheduleActions({ machineId: options.machine.id, tick: 0, actions: initial?.entryActions ?? [] }),
  };
  const events = options.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.stateMachineId === options.machine.id)
    .sort((left, right) => left.event.tick - right.event.tick || left.index - right.index);

  for (const { event } of events) {
    const advanced = advanceAfterTransitions({ machine: options.machine, replay, maximumTick: event.tick, context: options.context });

    if (advanced.status === 'invalid') return advanced;
    replay = advanced.value;

    const transition = chooseTransition({
      machine: options.machine,
      stateId: replay.stateId,
      input: event.input,
      ticksInState: event.tick - replay.enteredAtTick,
      context: options.context,
    });

    if (transition !== undefined) replay = takeTransition({ machine: options.machine, replay, transition, tick: event.tick, eventId: event.id });
  }

  const advanced = advanceAfterTransitions({ machine: options.machine, replay, maximumTick: options.tick, context: options.context });

  if (advanced.status === 'invalid') return advanced;
  replay = advanced.value;

  return resolvedEvaluationV1({
    tick: options.tick,
    machineStates: [{ stateMachineId: options.machine.id, stateId: replay.stateId, enteredAtTick: replay.enteredAtTick }],
    sequenceActions: replay.sequenceActions,
  });
}

export function deriveStateSnapshotV1(options: {
  readonly machines: readonly projectFormatV1.StateMachine[];
  readonly eventLog: readonly RuntimeStateEventV1[];
  readonly context: ExpressionContextV1;
  readonly tick: number;
}): PlaybackEvaluationResultV1<DerivedStateSnapshotV1> {
  const machineStates: DerivedMachineStateV1[] = [];
  const sequenceActions: ScheduledSequenceActionV1[] = [];

  for (const machine of options.machines) {
    const result = evaluateStateMachineAtTickV1({ machine, events: options.eventLog, tick: options.tick, context: options.context });

    if (result.status === 'invalid') return result;
    for (const machineState of result.value.machineStates) machineStates.push(machineState);
    for (const sequenceAction of result.value.sequenceActions) sequenceActions.push(sequenceAction);
  }

  return resolvedEvaluationV1({ tick: options.tick, machineStates, sequenceActions });
}
