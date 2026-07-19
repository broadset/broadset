import { createProjectEditorStore, type ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import type * as BroadsetUi from '@broadset/ui';
import type { StateMachineEditorProps } from '@broadset/ui';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { guardOperandId } from './v1-guard-action-translation';
import { buildProjectFixture } from './v1-guard-action-translation.test-support';
import { V1SequenceSidebar } from './v1-sequence-sidebar';

/**
 * Captures the live props `V1SequenceSidebar` wires into `StateMachineEditor` so a test can drive
 * `onAddTransition`/`onUpdateTransition` directly with drafts the real trigger-kind Select can no
 * longer produce (the UI-level fix for the empty-event-id crash removes the "Event" option once
 * `eventOptions` is empty). This is the only way to regression-test the demo's defense-in-depth
 * `toModelTransitionTrigger` guard once the primary UI defense makes the bad draft unreachable
 * through real interaction.
 */
let capturedStateMachineEditorProps: StateMachineEditorProps | null = null;

vi.mock('@broadset/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof BroadsetUi>();

  return {
    ...actual,
    StateMachineEditor: (props: StateMachineEditorProps) => {
      capturedStateMachineEditorProps = props;

      return <actual.StateMachineEditor {...props} />;
    },
  };
});

function firstTrack(store: ProjectEditorStore): projectFormatV1.Track {
  const track = store.getState().project.documents[0]?.sequences[0]?.tracks[0];

  if (track === undefined) throw new Error('Expected a seeded track');

  return track;
}

function firstSequenceId(store: ProjectEditorStore): projectFormatV1.Id {
  const sequenceId = store.getState().project.documents[0]?.sequences[0]?.id;

  if (sequenceId === undefined) throw new Error('Expected a seeded sequence');

  return sequenceId;
}

function addModifier(name: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'New modifier name' }), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add modifier' }));
}

function findMachineByName(store: ProjectEditorStore, name: string): projectFormatV1.StateMachine | undefined {
  return store.getState().project.documents[0]?.stateMachines.find((machine) => machine.name === name);
}

/** A modifier's activation transition is the one leaving the machine's initial ("inactive") state. */
function findActivationTransition(machine: projectFormatV1.StateMachine): projectFormatV1.Transition {
  const transition = machine.transitions.find(({ sourceStateId }) => sourceStateId === machine.initialStateId);

  if (transition === undefined) throw new Error('Expected an activation transition');

  return transition;
}

function findViewModelField(
  document: projectFormatV1.BroadsetDocumentV1,
  fieldName: string,
): { readonly viewModelId: projectFormatV1.Id; readonly fieldId: projectFormatV1.Id } {
  for (const viewModel of document.viewModels) {
    const field = viewModel.fields.find((candidate) => candidate.name === fieldName);

    if (field !== undefined) return { viewModelId: viewModel.id, fieldId: field.id };
  }

  throw new Error(`Expected a "${fieldName}" view-model field`);
}

describe('V1SequenceSidebar', () => {
  it('edits a keyframe value through the invariant-safe sequence command', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const keyframe = firstTrack(store).keyframes[0];

    if (keyframe?.value.type !== 'number') throw new Error('Expected a number keyframe');

    render(<V1SequenceSidebar editorStore={store} />);

    fireEvent.change(screen.getByTestId(`keyframe-value-${keyframe.id}`), { target: { value: '0.25' } });

    await waitFor(() => {
      const updated = firstTrack(store).keyframes.find(({ id }) => id === keyframe.id);

      expect(updated?.value).toEqual({ type: 'number', value: 0.25 });
    });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('adds and removes a keyframe on an existing track', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const track = firstTrack(store);
    const sequenceId = firstSequenceId(store);
    const usedTicks = new Set(track.keyframes.map(({ tick }) => tick));

    let freeTick = 1;

    while (usedTicks.has(freeTick)) freeTick += 1;

    store.getState().seekPlaybackTick(freeTick);
    render(<V1SequenceSidebar editorStore={store} />);

    fireEvent.click(screen.getByTestId(`add-keyframe-${track.id}`));

    await waitFor(() => {
      const ticks = firstTrack(store).keyframes.map(({ tick }) => tick);

      expect(ticks).toContain(freeTick);
    });

    const added = firstTrack(store).keyframes.find(({ tick }) => tick === freeTick);

    if (added === undefined) throw new Error('Expected the added keyframe');

    fireEvent.click(screen.getByTestId(`remove-keyframe-${added.id}`));

    await waitFor(() => {
      expect(firstTrack(store).keyframes.map(({ id }) => id)).not.toContain(added.id);
    });

    expect(store.getState().playbackSequenceId).toBe(sequenceId);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('adds a canonical two-state modifier state machine from the animation state sections', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'New modifier name' }), { target: { value: 'Flash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add modifier' }));

    const machines = store.getState().project.documents[0]?.stateMachines ?? [];
    const added = machines.find((machine) => machine.name === 'Flash');

    expect(added?.states.map(({ name }) => name)).toEqual(['inactive', 'active']);
    expect(added?.states.flatMap(({ values }) => values)).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it("adds a transition through a modifier's state-machine editor, preserving other machines", () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    addModifier('Flash');
    addModifier('Glow');

    const flash = findMachineByName(store, 'Flash');
    const glow = findMachineByName(store, 'Glow');

    if (flash === undefined || glow === undefined) throw new Error('Expected Flash and Glow machines');

    const glowTransitionsBefore = glow.transitions;
    const activeStateId = flash.states.find((candidate) => candidate.name === 'active')?.id;

    if (activeStateId === undefined) throw new Error('Expected an active state on Flash');

    const editor = screen.getByTestId(`state-machine-editor-${flash.id}`);
    const addRow = within(editor).getByTestId('sm-add-transition-row');

    fireEvent.click(within(addRow).getByRole('button', { name: /target state/i }));
    fireEvent.click(screen.getByRole('option', { name: 'active' }));
    fireEvent.click(within(addRow).getByTestId('sm-add-transition'));

    const updatedFlash = findMachineByName(store, 'Flash');
    const added = updatedFlash?.transitions.find(
      (transition) => transition.targetStateId === activeStateId && transition.trigger.kind === 'lifecycle',
    );

    expect(updatedFlash?.transitions).toHaveLength(3);
    expect(added?.sourceStateId).toBe(flash.initialStateId);
    expect(added?.targetStateId).toBe(activeStateId);
    expect(added?.trigger).toEqual({ kind: 'lifecycle', phase: 'out' });
    expect(added?.priority).toBe(0);
    expect(added?.actions).toEqual([]);
    expect(findMachineByName(store, 'Glow')?.transitions).toEqual(glowTransitionsBefore);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it("updates a transition's priority through the state-machine editor, preserving guard and actions", () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    const deactivationTransition = flash.transitions.find(
      ({ targetStateId }) => targetStateId === flash.initialStateId,
    );

    if (deactivationTransition === undefined) throw new Error('Expected a deactivation transition');

    const editor = screen.getByTestId(`state-machine-editor-${flash.id}`);
    const row = within(editor).getByTestId(`sm-transition-${deactivationTransition.id}`);
    const priorityInput = within(row).getByLabelText('Priority', { selector: 'input' });

    fireEvent.change(priorityInput, { target: { value: '5' } });
    fireEvent.blur(priorityInput);

    const updated = findMachineByName(store, 'Flash')?.transitions.find(
      (transition) => transition.id === deactivationTransition.id,
    );

    expect(updated?.priority).toBe(5);
    expect(updated?.guard).toEqual(deactivationTransition.guard);
    expect(updated?.actions).toEqual(deactivationTransition.actions);
    expect(updated?.sourceStateId).toBe(deactivationTransition.sourceStateId);
    expect(updated?.targetStateId).toBe(deactivationTransition.targetStateId);
    expect(updated?.trigger).toEqual(deactivationTransition.trigger);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it("wires a reverse-exit sequence onto a modifier's deactivation transition", () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    const sequencesBefore = store.getState().project.documents[0]?.sequences.length ?? 0;

    fireEvent.click(screen.getByRole('button', { name: 'Wire reverse exit into Flash' }));

    const documentAfter = store.getState().project.documents[0];
    const newSequence = documentAfter?.sequences.at(-1);

    expect(documentAfter?.sequences.length).toBe(sequencesBefore + 1);

    if (newSequence === undefined) throw new Error('Expected a reversed sequence');

    const updatedFlash = findMachineByName(store, 'Flash');
    const deactivationTransition = updatedFlash?.transitions.find(
      ({ targetStateId }) => targetStateId === updatedFlash.initialStateId,
    );

    expect(deactivationTransition?.actions).toEqual([
      { kind: 'play-sequence', sequenceId: newSequence.id, behavior: 'restart' },
    ]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  /**
   * @description Regression for the empty-event-id ZodError crash: even bypassing the UI-level
   * fix (which stops the trigger-kind Select from ever offering "Event" with no event options),
   * an `{kind:'event', eventId:''}` draft reaching `onAddTransition`/`onUpdateTransition` directly
   * must no-op — never call `idSchema.parse` on the empty id and throw — leaving the store
   * untouched and structurally valid.
   */
  it('no-ops instead of throwing when a trigger draft carries an empty event id', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    if (capturedStateMachineEditorProps === null) throw new Error('Expected StateMachineEditor to render');

    const transitionsBefore = flash.transitions;
    const existingTransitionId = transitionsBefore[0]?.id;

    if (existingTransitionId === undefined) throw new Error('Expected a seeded transition');

    expect(() => {
      capturedStateMachineEditorProps?.onAddTransition({
        sourceStateId: flash.initialStateId,
        targetStateId: flash.initialStateId,
        trigger: { kind: 'event', eventId: '' },
      });
    }).not.toThrow();
    expect(findMachineByName(store, 'Flash')?.transitions).toEqual(transitionsBefore);

    expect(() => {
      capturedStateMachineEditorProps?.onUpdateTransition(existingTransitionId, {
        trigger: { kind: 'event', eventId: '' },
      });
    }).not.toThrow();
    expect(findMachineByName(store, 'Flash')?.transitions).toEqual(transitionsBefore);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  /**
   * @description timeline.md "Lifecycle and State-Machine Authoring Sections": state-machine
   * controls edit expression guards, not just typed triggers/priorities. Adding a root-level
   * condition (`sm-guard-add-condition-guard-root`, the empty-root placeholder id) and switching
   * the fresh comparison's operand to the "Live Broadcast Data / Show Network Bug" boolean
   * view-model field then flipping its literal to `true` must produce a valid-by-construction `eq`
   * comparison guard, keep the project semantically valid, and round-trip back through
   * `expressionToGuard` as a non-advanced, single-comparison root group (proving the reverse view
   * sees the same guard it just authored, at the deterministic `grp-root`/`cmp-0` path ids).
   */
  it('adds a guard condition on a boolean view-model field, producing a valid boolean-equality guard', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);
    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    const activation = findActivationTransition(flash);
    const document = store.getState().project.documents[0];

    if (document === undefined) throw new Error('Expected a document');

    const { viewModelId, fieldId } = findViewModelField(document, 'showBranding');
    const row = within(screen.getByTestId(`state-machine-editor-${flash.id}`)).getByTestId(
      `sm-transition-${activation.id}`,
    );

    fireEvent.click(within(row).getByTestId('sm-guard-add-condition-guard-root'));

    const comparisonRow = within(row).getByTestId('sm-guard-comparison-cmp-0');

    fireEvent.click(within(comparisonRow).getByRole('button', { name: /guard operand/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Live Broadcast Data / Show Network Bug' }));
    fireEvent.click(
      within(within(row).getByTestId('sm-guard-comparison-cmp-0')).getByRole('switch', { name: 'Guard literal' }),
    );

    const updated = findMachineByName(store, 'Flash')?.transitions.find(({ id }) => id === activation.id);

    expect(updated?.guard).toEqual({
      kind: 'binary',
      operator: 'eq',
      left: { kind: 'field', viewModelId, fieldId },
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);

    if (capturedStateMachineEditorProps === null) throw new Error('Expected StateMachineEditor to render');

    const reverseTransition = capturedStateMachineEditorProps.machine.transitions.find(
      ({ id }) => id === activation.id,
    );

    expect(reverseTransition?.guardIsAdvanced).toBeFalsy();
    expect(reverseTransition?.guard).toEqual({
      kind: 'group',
      id: 'grp-root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'cmp-0',
          operandId: guardOperandId({ kind: 'field', viewModelId, fieldId }),
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
      ],
    });
  });

  /**
   * @description PR-G contract: the guard tree supports NESTED AND/OR groups, not just a flat list
   * of comparisons. Seeds a transition directly with an already-nested model guard —
   * `and(showBranding == true, or(showStats == true, showSponsor == true))` — because a group the
   * UI adds via "Add group" starts EMPTY, and an empty group contributes nothing to the persisted
   * `ExpressionAst` (see `guardDraftToExpression`'s empty-group handling), so it is pruned the
   * instant the round trip through the store re-derives the presentational tree; the only way to
   * reach a non-empty, editable nested group through genuine UI interaction is for it to already
   * exist. Then drives a REAL click scoped to the nested inner group's own "Add condition" control
   * (`sm-guard-add-condition-grp-1`, the deterministic reverse-translated id for the group at root
   * child index 1) to prove the edit only appends to THAT group's children — the sibling root-level
   * comparison is untouched — while the whole tree stays a valid nested `and`/`or` expression.
   */
  it('edits a nested guard tree, adding a condition scoped to the nested group and keeping the guard semantically valid', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);
    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    const deactivationTransition = flash.transitions.find(
      ({ targetStateId }) => targetStateId === flash.initialStateId,
    );

    if (deactivationTransition === undefined) throw new Error('Expected a deactivation transition');

    const document = store.getState().project.documents[0];

    if (document === undefined) throw new Error('Expected a document');

    const { viewModelId, fieldId: brandingFieldId } = findViewModelField(document, 'showBranding');
    const { fieldId: statsFieldId } = findViewModelField(document, 'showStats');
    const { fieldId: sponsorFieldId } = findViewModelField(document, 'showSponsor');
    const fieldEqualsTrue = (fieldId: projectFormatV1.Id): projectFormatV1.ExpressionAst => ({
      kind: 'binary',
      operator: 'eq',
      left: { kind: 'field', viewModelId, fieldId },
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
    const nestedGuard: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'and',
      left: fieldEqualsTrue(brandingFieldId),
      right: {
        kind: 'binary',
        operator: 'or',
        left: fieldEqualsTrue(statsFieldId),
        right: fieldEqualsTrue(sponsorFieldId),
      },
    };
    // A direct store mutation (bypassing `fireEvent`) is not auto-wrapped in `act()` by React
    // Testing Library, so it must be wrapped explicitly here — otherwise the subsequent DOM query
    // for the nested group's own "Add condition" control can observe a stale, pre-update render.
    let seeded = false;

    act(() => {
      seeded = store.getState().upsertTransition(flash.id, { ...deactivationTransition, guard: nestedGuard });
    });

    expect(seeded).toBe(true);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);

    const editor = screen.getByTestId(`state-machine-editor-${flash.id}`);
    const row = within(editor).getByTestId(`sm-transition-${deactivationTransition.id}`);

    fireEvent.click(within(row).getByTestId('sm-guard-add-condition-grp-1'));

    const updatedGuard = findMachineByName(store, 'Flash')?.transitions.find(
      ({ id }) => id === deactivationTransition.id,
    )?.guard;

    if (updatedGuard?.kind !== 'binary') {
      throw new Error('Expected the nested guard to remain a binary and/or expression');
    }

    expect(updatedGuard.operator).toBe('and');
    expect(updatedGuard.left).toEqual(fieldEqualsTrue(brandingFieldId));
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);

    if (capturedStateMachineEditorProps === null) throw new Error('Expected StateMachineEditor to render');

    const reverseTransition = capturedStateMachineEditorProps.machine.transitions.find(
      ({ id }) => id === deactivationTransition.id,
    );

    expect(reverseTransition?.guardIsAdvanced).toBeFalsy();

    if (reverseTransition?.guard === undefined) throw new Error('Expected a resolved nested guard draft');

    expect(reverseTransition.guard.children).toHaveLength(2);

    const nestedChild = reverseTransition.guard.children[1];

    if (nestedChild?.kind !== 'group') {
      throw new Error('Expected the second root child to remain a nested group');
    }

    expect(nestedChild.children).toHaveLength(3);
  });

  /**
   * @description timeline.md "Lifecycle and State-Machine Authoring Sections": state-machine
   * controls edit optional transition sequence actions. Clicking "Add action" on a transition (the
   * default draft is `play-sequence` against the first `sequenceOptions` entry) must append that
   * action to the store transition and keep the project semantically valid.
   */
  it('adds a play-sequence action to a transition', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);
    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    const activation = findActivationTransition(flash);
    const firstSequenceId = store.getState().project.documents[0]?.sequences[0]?.id;

    if (firstSequenceId === undefined) throw new Error('Expected a seeded sequence');

    const row = within(screen.getByTestId(`state-machine-editor-${flash.id}`)).getByTestId(
      `sm-transition-${activation.id}`,
    );
    const addActionRow = within(row).getByTestId(`sm-transition-${activation.id}-add-action`);

    fireEvent.click(within(addActionRow).getByRole('button', { name: 'Add action' }));

    const updated = findMachineByName(store, 'Flash')?.transitions.find(({ id }) => id === activation.id);

    expect(updated?.actions).toEqual([{ kind: 'play-sequence', sequenceId: firstSequenceId, behavior: 'restart' }]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  /**
   * @description timeline.md "Lifecycle and State-Machine Authoring Sections": clearing a guard's
   * last remaining root-level condition (an empty-children root `GuardDraft`) must translate back
   * to `undefined` on the store transition, per `guardDraftToExpression`'s
   * empty-children-clears-the-guard contract.
   */
  it('clears the guard when the last condition is removed from the root group', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);
    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    const activation = findActivationTransition(flash);
    const row = within(screen.getByTestId(`state-machine-editor-${flash.id}`)).getByTestId(
      `sm-transition-${activation.id}`,
    );

    fireEvent.click(within(row).getByTestId('sm-guard-add-condition-guard-root'));

    const withClause = findMachineByName(store, 'Flash')?.transitions.find(({ id }) => id === activation.id);

    expect(withClause?.guard).not.toBeUndefined();

    const comparisonRow = within(row).getByTestId('sm-guard-comparison-cmp-0');

    fireEvent.click(within(comparisonRow).getByRole('button', { name: 'Remove condition' }));

    const cleared = findMachineByName(store, 'Flash')?.transitions.find(({ id }) => id === activation.id);

    expect(cleared?.guard).toBeUndefined();
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  /**
   * @description Regression for the date-time silent-no-op (PR-F final review, FIX 1). The model's
   * `utcTimestampSchema` rejects `''` and any non-ISO-offset string, so before this fix, adding a
   * guard clause and switching its operand to a date-time view-model field (here, "Live Data /
   * Kickoff") produced an invalid literal that `guardDraftToExpression -> upsertTransition ->
   * isValidProject` silently rejected — the store transition kept `guard: undefined` with zero
   * user-visible feedback. This test drives the real `TransitionGuardEditor` UI end-to-end and
   * proves both halves of the fix: (1) the freshly-selected date-time clause persists a schema-valid
   * guard immediately (the library-level valid-by-construction default), and (2) typing an invalid
   * ISO string is rejected client-side via `aria-invalid` — using the REAL
   * `projectFormatV1.utcTimestampSchema` injected from this demo, not merely the library's
   * accept-everything default — so a bad keystroke never reaches the store at all.
   */
  it('adds a guard clause on the Kickoff date-time field, producing a schema-valid guard with real-time validation', () => {
    const fixture = buildProjectFixture({});
    const store = createProjectEditorStore({ project: fixture.project });

    render(<V1SequenceSidebar editorStore={store} />);

    const primary = fixture.document.stateMachines.find((machine) => machine.name === 'Primary');

    if (primary === undefined) throw new Error('Expected a Primary state machine');

    const transition = primary.transitions[0];

    if (transition === undefined) throw new Error('Expected a seeded transition on Primary');

    const findTransition = (): projectFormatV1.Transition | undefined =>
      store
        .getState()
        .project.documents[0]?.stateMachines.find((machine) => machine.id === primary.id)
        ?.transitions.find((candidate) => candidate.id === transition.id);

    const editor = screen.getByTestId(`state-machine-editor-${primary.id}`);
    const row = within(editor).getByTestId(`sm-transition-${transition.id}`);

    fireEvent.click(within(row).getByTestId('sm-guard-add-condition-guard-root'));

    const comparisonRow = within(row).getByTestId('sm-guard-comparison-cmp-0');

    fireEvent.click(within(comparisonRow).getByRole('button', { name: /guard operand/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Live Data / Kickoff' }));

    const withDefaultLiteral = findTransition();

    expect(withDefaultLiteral?.guard).toBeDefined();
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);

    const literalInput = within(within(row).getByTestId('sm-guard-comparison-cmp-0')).getByLabelText('Guard literal', {
      selector: 'input',
    });

    fireEvent.change(literalInput, { target: { value: 'not-a-date' } });

    expect(literalInput.getAttribute('aria-invalid')).toBe('true');
    expect(findTransition()?.guard).toEqual(withDefaultLiteral?.guard);

    fireEvent.change(literalInput, { target: { value: '2030-05-01T00:00:00Z' } });

    expect(literalInput.getAttribute('aria-invalid')).not.toBe('true');

    const withTypedLiteral = findTransition();

    expect(withTypedLiteral?.guard).not.toEqual(withDefaultLiteral?.guard);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  /**
   * @description Regression against future refactors (PR-F final review, FIX 4): an ADVANCED
   * (non-flat) model guard — one `expressionToGuard` cannot represent as a flat `GuardDraft`, e.g. a
   * `unary not` of a boolean field — must survive an UNRELATED transition edit (here, priority)
   * losslessly. `onUpdateTransition`'s `{...found, ...}` spread already preserves any guard the
   * patch doesn't touch; this test guards that invariant against a future refactor that narrows the
   * spread or special-cases the advanced-guard shape.
   */
  it('preserves an advanced (non-flat) guard through an unrelated priority edit', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);
    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    const deactivationTransition = flash.transitions.find(
      ({ targetStateId }) => targetStateId === flash.initialStateId,
    );

    if (deactivationTransition === undefined) throw new Error('Expected a deactivation transition');

    const document = store.getState().project.documents[0];

    if (document === undefined) throw new Error('Expected a document');

    const { viewModelId, fieldId } = findViewModelField(document, 'showBranding');
    const advancedGuard: projectFormatV1.ExpressionAst = {
      kind: 'unary',
      operator: 'not',
      operand: { kind: 'field', viewModelId, fieldId },
    };
    const seeded = store.getState().upsertTransition(flash.id, { ...deactivationTransition, guard: advancedGuard });

    expect(seeded).toBe(true);

    const withAdvancedGuard = findMachineByName(store, 'Flash')?.transitions.find(
      ({ id }) => id === deactivationTransition.id,
    );

    expect(withAdvancedGuard?.guard).toEqual(advancedGuard);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);

    const editor = screen.getByTestId(`state-machine-editor-${flash.id}`);
    const row = within(editor).getByTestId(`sm-transition-${deactivationTransition.id}`);
    const priorityInput = within(row).getByLabelText('Priority', { selector: 'input' });

    fireEvent.change(priorityInput, { target: { value: '7' } });
    fireEvent.blur(priorityInput);

    const updated = findMachineByName(store, 'Flash')?.transitions.find(
      (candidate) => candidate.id === deactivationTransition.id,
    );

    expect(updated?.priority).toBe(7);
    expect(updated?.guard).toEqual(advancedGuard);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
