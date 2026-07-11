import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1, validateBroadsetProjectV1Semantics } from './index';
import { createReviewGroup, createReviewTarget, parseReviewProject } from './semantic-review-fixtures';

function createStateProject(): ReturnType<typeof createMinimalProjectV1> {
  const project = createMinimalProjectV1();
  const document = project.documents[0];

  if (document === undefined) return project;

  return parseReviewProject({ ...project, documents: [{ ...document, elements: [createReviewGroup('element')] }] });
}

describe('state machine and lifecycle semantics', () => {
  it.each([
    ['source tick equal to duration', 10, 10],
    ['zero-duration child', 0, 0],
  ])('rejects a freeze remap with %s', (_name, childDuration, sourceTick) => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const child = {
      id: 'child', name: 'Child', durationTicks: childDuration,
      loop: { kind: 'none' }, tracks: [], markers: [], cues: [], childClips: [],
    };
    const parent = {
      id: 'parent', name: 'Parent', durationTicks: 10,
      loop: { kind: 'none' }, tracks: [], markers: [], cues: [],
      childClips: [{
        id: 'clip', sequenceId: child.id, outputRange: [0, 1],
        remap: { kind: 'freeze', sourceTick },
      }],
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, sequences: [child, parent] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'sequence.invalid-interval', pointer: '/documents/0/sequences/1/childClips/0/remap' }),
    );
  });

  it('accepts a linear remap whose range ends at child duration', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const child = { id: 'child', name: 'Child', durationTicks: 10, loop: { kind: 'none' }, tracks: [], markers: [], cues: [], childClips: [] };
    const parent = {
      id: 'parent', name: 'Parent', durationTicks: 10, loop: { kind: 'none' }, tracks: [], markers: [], cues: [],
      childClips: [{ id: 'clip', sequenceId: child.id, outputRange: [0, 10], remap: { kind: 'linear', sourceRange: [0, 10], direction: 'forward' } }],
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, sequences: [child, parent] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).not.toContainEqual(
      expect.objectContaining({ code: 'sequence.invalid-interval' }),
    );
  });

  it('rejects an invalid state-value target', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const machine = {
      id: 'machine',
      name: 'Machine',
      initialStateId: 'state',
      states: [{
        id: 'state',
        name: 'State',
        values: [{ id: 'value', target: createReviewTarget(project, 'element', '/id'), value: { type: 'string', value: 'x' } }],
        entryActions: [],
        exitActions: [],
      }],
      transitions: [],
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, stateMachines: [machine] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'target.invalid-pointer', pointer: '/documents/0/stateMachines/0/states/0/values/0/target' }),
    );
  });

  it('rejects missing sequence actions in state entry, exit, and transition actions', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const missing = { kind: 'play-sequence', sequenceId: 'missing', behavior: 'restart' };
    const machine = {
      id: 'machine',
      name: 'Machine',
      initialStateId: 'state',
      states: [{ id: 'state', name: 'State', values: [], entryActions: [missing], exitActions: [missing] }],
      transitions: [{
        id: 'transition',
        sourceStateId: 'state',
        targetStateId: 'state',
        trigger: { kind: 'event', eventId: 'go' },
        priority: 0,
        actions: [missing],
      }],
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, stateMachines: [machine] }] });
    const diagnostics = validateBroadsetProjectV1Semantics(actual);

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'sequence.missing-reference', pointer: '/documents/0/stateMachines/0/states/0/entryActions/0/sequenceId' }),
      expect.objectContaining({ code: 'sequence.missing-reference', pointer: '/documents/0/stateMachines/0/states/0/exitActions/0/sequenceId' }),
      expect.objectContaining({ code: 'sequence.missing-reference', pointer: '/documents/0/stateMachines/0/transitions/0/actions/0/sequenceId' }),
    ]));
  });

  it('rejects a lifecycle seek beyond the referenced sequence duration', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const sequence = { id: 'sequence', name: 'Sequence', durationTicks: 10, loop: { kind: 'none' }, tracks: [], markers: [], cues: [], childClips: [] };
    const lifecycle = { id: 'lifecycle', in: [{ kind: 'seek-sequence', sequenceId: 'sequence', tick: 11 }], hold: [], update: [], out: [] };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, sequences: [sequence], lifecycle }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'sequence.invalid-seek', pointer: '/documents/0/lifecycle/in/0/tick' }),
    );
  });

  it('rejects a contextually unresolved boolean transition guard', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const machine = {
      id: 'machine', name: 'Machine', initialStateId: 'state',
      states: [{ id: 'state', name: 'State', values: [], entryActions: [], exitActions: [] }],
      transitions: [{
        id: 'transition', sourceStateId: 'state', targetStateId: 'state',
        trigger: { kind: 'event', eventId: 'go' },
        guard: { kind: 'field', viewModelId: 'missing', fieldId: 'missing' }, priority: 0, actions: [],
      }],
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, stateMachines: [machine] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'state.invalid-guard', pointer: '/documents/0/stateMachines/0/transitions/0/guard' }),
    );
  });
});

describe('binding inference diagnostic projection', () => {
  it('preserves distinct expression diagnostics when the binding target is invalid', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const binding = {
      id: 'binding',
      target: createReviewTarget(project, 'element', '/id'),
      expression: {
        kind: 'binary',
        operator: 'add',
        left: { kind: 'variable', collectionId: 'missing', variableId: 'left' },
        right: { kind: 'variable', collectionId: 'missing', variableId: 'right' },
      },
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, bindings: [binding] }] });
    const diagnostics = validateBroadsetProjectV1Semantics(actual);

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'target.invalid-pointer', pointer: '/documents/0/bindings/0/target' }),
      expect.objectContaining({ code: 'expression.variable-not-found', pointer: '/documents/0/bindings/0/expression/left/variableId' }),
      expect.objectContaining({ code: 'expression.variable-not-found', pointer: '/documents/0/bindings/0/expression/right/variableId' }),
    ]));
  });

  it('projects a later formatter failure to its exact step', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const binding = {
      id: 'binding',
      target: createReviewTarget(project, 'element', '/appearance/opacity'),
      expression: { kind: 'literal', value: { type: 'string', value: 'x' } },
      formatter: { steps: [
        { id: 'prefix', formatterId: 'prefix', arguments: [{ type: 'string', value: '$' }] },
        { id: 'number', formatterId: 'number', arguments: [{ type: 'string', value: 'fi-FI' }] },
      ] },
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, bindings: [binding] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'formatter.invalid-input', pointer: '/documents/0/bindings/0/formatter/steps/1' }),
    );
  });

  it('projects a missing variable diagnostic to the variable reference', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const binding = {
      id: 'binding',
      target: createReviewTarget(project, 'element', '/appearance/opacity'),
      expression: { kind: 'variable', collectionId: 'missing', variableId: 'missing' },
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, bindings: [binding] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'expression.variable-not-found', pointer: '/documents/0/bindings/0/expression/variableId' }),
    );
  });

  it('projects invalid expression operands to the expression node', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const binding = {
      id: 'binding',
      target: createReviewTarget(project, 'element', '/appearance/opacity'),
      expression: {
        kind: 'binary', operator: 'mul',
        left: { kind: 'literal', value: { type: 'string', value: 'x' } },
        right: { kind: 'literal', value: { type: 'number', value: 2 } },
      },
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, bindings: [binding] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'expression.invalid-operand', pointer: '/documents/0/bindings/0/expression' }),
    );
  });

  it('projects formatter input errors to the failing formatter step', () => {
    const project = createStateProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const binding = {
      id: 'binding',
      target: createReviewTarget(project, 'element', '/appearance/opacity'),
      expression: { kind: 'literal', value: { type: 'string', value: 'x' } },
      formatter: {
        steps: [
          { id: 'formatter', formatterId: 'number', arguments: [{ type: 'string', value: '0.00' }] },
        ],
      },
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, bindings: [binding] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'formatter.invalid-input', pointer: '/documents/0/bindings/0/formatter/steps/0' }),
    );
  });
});
