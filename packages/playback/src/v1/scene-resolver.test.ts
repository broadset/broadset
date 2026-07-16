import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as model } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { resolveSceneSnapshotV1, type SceneFieldValueV1 } from './scene-resolver';

type Id = projectFormatV1.Id;

const id = (value: string): Id => model.idSchema.parse(value);
const PROJECT_ID = id('project');
const DOCUMENT_ID = id('document');
const PAGE_ID = id('page');
const ROOT_ID = id('root');
const ELEMENT_ID = id('element');
const VIEW_MODEL_ID = id('view-model');
const FIELD_ID = id('opacity');

function project(): projectFormatV1.BroadsetProjectV1 {
  const element = model.createElementV1({
    id: ELEMENT_ID,
    name: 'Element',
    geometry: model.createElementGeometry({ width: 100, height: 100 }),
    kind: 'group',
  });
  const page: projectFormatV1.PageDefinition = {
    ...model.createPageV1({
      id: PAGE_ID,
      rootInstances: [{ id: ROOT_ID, elementId: ELEMENT_ID, overrides: [], componentPropertyValues: [] }],
    }),
    selectedSampleDataSets: { [VIEW_MODEL_ID]: id('sample') },
  };
  const document: projectFormatV1.BroadsetDocumentV1 = {
    ...model.createDocumentV1({ id: DOCUMENT_ID, elements: [element], pages: [page] }),
    viewModels: [{
      id: VIEW_MODEL_ID,
      name: 'Data',
      fields: [{ id: FIELD_ID, name: 'Opacity', schema: { kind: 'number', minimum: 0, maximum: 1 }, defaultValue: { type: 'number', value: 0.75 } }],
      sampleDataSets: [{ id: id('sample'), name: 'Sample', values: { [FIELD_ID]: { type: 'number', value: 0.5 } } }],
    }],
    bindings: [{
      id: id('binding'),
      target: { entity: { projectId: PROJECT_ID, documentId: DOCUMENT_ID, entityKind: 'element', entityId: ELEMENT_ID }, pointer: '/appearance/opacity' },
      expression: { kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID },
      fallback: { type: 'number', value: 1 },
    }],
  };

  return model.createProjectV1({ id: PROJECT_ID, documents: [document] });
}

function resolve(fieldValues: readonly SceneFieldValueV1[] = [], tick = 0) {
  return resolveSceneSnapshotV1({ project: project(), documentId: DOCUMENT_ID, pageId: PAGE_ID, tick, fieldValues, events: [] });
}

function lifecycleProject(): projectFormatV1.BroadsetProjectV1 {
  const base = project();
  const document = base.documents[0];

  if (document === undefined) return base;

  const sequenceId = id('out-sequence');
  const motion: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    kind: 'motion',
    timebase: { frameRate: { numerator: 25, denominator: 1 }, ticksPerSecond: 1000, timecode: { nominalFramesPerSecond: 25, dropFrame: false } },
    sequences: [{ id: sequenceId, name: 'Out', durationTicks: 2, loop: { kind: 'none' }, tracks: [], markers: [], cues: [], childClips: [] }],
    lifecycle: { id: id('lifecycle'), in: [], hold: [], update: [], out: [{ kind: 'play-sequence', sequenceId, behavior: 'restart' }] },
  };

  return model.createProjectV1({ id: PROJECT_ID, documents: [motion] });
}

function resumedLifecycleProject(): projectFormatV1.BroadsetProjectV1 {
  const base = lifecycleProject();
  const document = base.documents[0];
  const page = document?.pages[0];
  const sequence = document?.sequences[0];
  const lifecycle = document?.lifecycle;

  if (document === undefined || page === undefined || sequence === undefined || lifecycle === undefined) return base;

  return model.createProjectV1({
    id: PROJECT_ID,
    documents: [{
      ...document,
      pages: [{ ...page, sequenceId: sequence.id }],
      lifecycle: { ...lifecycle, out: [{ kind: 'play-sequence', sequenceId: sequence.id, behavior: 'resume' }] },
    }],
  });
}

function hiddenStaleProject(): projectFormatV1.BroadsetProjectV1 {
  const base = project();
  const document = base.documents[0];
  const page = document?.pages[0];

  if (document === undefined || page === undefined) return base;

  const viewModel = document.viewModels[0];

  if (viewModel === undefined) return base;

  const hiddenViewModel: projectFormatV1.ViewModel = {
    ...viewModel,
    fields: viewModel.fields.map((field) => ({ ...field, stalePolicy: 'hide' as const })),
  };
  const hiddenPage = { ...page, selectedSampleDataSets: {} };
  const hiddenDocument = { ...document, pages: [hiddenPage], viewModels: [hiddenViewModel] };

  return model.createProjectV1({ id: PROJECT_ID, documents: [hiddenDocument] });
}

function nestedHiddenStaleProject(): projectFormatV1.BroadsetProjectV1 {
  const base = hiddenStaleProject();
  const document = base.documents[0];
  const element = document?.elements[0];
  const binding = document?.bindings[0];

  if (document === undefined || element === undefined || binding === undefined) return base;

  const fillId = id('fill');
  const withFill: projectFormatV1.Element = {
    ...element,
    appearance: {
      ...element.appearance,
      fills: [{
        id: fillId,
        enabled: true,
        opacity: 1,
        blendMode: 'normal',
        paint: { kind: 'solid', color: model.createBlackColorValue() },
      }],
    },
  };

  return model.createProjectV1({
    id: PROJECT_ID,
    documents: [{
      ...document,
      elements: [withFill],
      bindings: [{
        ...binding,
        target: {
          entity: { ...binding.target.entity, entityKind: 'fill', entityId: fillId },
          pointer: '/opacity',
        },
      }],
    }],
  });
}

function eventProject(): projectFormatV1.BroadsetProjectV1 {
  const base = project();
  const document = base.documents[0];

  if (document === undefined) return base;

  const stateId = id('state');
  const machine: projectFormatV1.StateMachine = {
    id: id('machine'),
    name: 'Machine',
    initialStateId: stateId,
    states: [{ id: stateId, name: 'State', values: [], entryActions: [], exitActions: [] }],
    transitions: [{ id: id('known-transition'), sourceStateId: stateId, targetStateId: stateId, trigger: { kind: 'event', eventId: id('known-event') }, priority: 0, actions: [] }],
  };

  return model.createProjectV1({ id: PROJECT_ID, documents: [{ ...document, stateMachines: [machine] }] });
}

function canonicalConflictProject(): projectFormatV1.BroadsetProjectV1 {
  const base = project();
  const document = base.documents[0];
  const page = document?.pages[0];
  const root = page?.rootInstances[0];

  if (document === undefined || page === undefined || root === undefined) return base;

  return model.createProjectV1({
    id: PROJECT_ID,
    documents: [{
      ...document,
      pages: [{
        ...page,
        rootInstances: [{
          ...root,
          overrides: [{
            target: {
              entity: {
                projectId: PROJECT_ID,
                documentId: DOCUMENT_ID,
                pageId: PAGE_ID,
                entityKind: 'element',
                entityId: ELEMENT_ID,
                instancePath: [ROOT_ID],
              },
              pointer: '/appearance/opacity',
            },
            value: { type: 'number', value: 0.4 },
          }],
        }],
      }],
    }],
  });
}

function bindingFallbackProject(): projectFormatV1.BroadsetProjectV1 {
  const base = project();
  const document = base.documents[0];
  const page = document?.pages[0];
  const viewModel = document?.viewModels[0];

  if (document === undefined || page === undefined || viewModel === undefined) return base;

  const fields = viewModel.fields.map(({ defaultValue: _defaultValue, ...field }) => field);

  return model.createProjectV1({
    id: PROJECT_ID,
    documents: [{
      ...document,
      pages: [{ ...page, selectedSampleDataSets: {} }],
      viewModels: [{ ...viewModel, fields }],
    }],
  });
}

function composedPlaybackProject(): projectFormatV1.BroadsetProjectV1 {
  const base = project();
  const document = base.documents[0];
  const page = document?.pages[0];

  if (document === undefined || page === undefined) return base;

  const target = (pointer: string): projectFormatV1.PropertyTarget => ({
    entity: { projectId: PROJECT_ID, documentId: DOCUMENT_ID, entityKind: 'element', entityId: ELEMENT_ID },
    pointer,
  });
  const pageSequenceId = id('page-sequence');
  const lifecycleSequenceId = id('lifecycle-sequence');
  const sequence = (options: {
    readonly id: Id;
    readonly valueType: projectFormatV1.ValueType;
    readonly target: projectFormatV1.PropertyTarget;
    readonly value: projectFormatV1.TypedValue;
  }): projectFormatV1.Sequence => ({
    id: options.id,
    name: String(options.id),
    durationTicks: 10,
    loop: { kind: 'none' },
    tracks: [{
      id: id(`${String(options.id)}-track`),
      name: 'Track',
      target: options.target,
      valueType: options.valueType,
      keyframes: [{ id: id(`${String(options.id)}-keyframe`), tick: 0, value: options.value }],
    }],
    markers: [],
    cues: [],
    childClips: [],
  });
  const stateId = id('composed-state');
  const machine: projectFormatV1.StateMachine = {
    id: id('composed-machine'),
    name: 'Composed',
    initialStateId: stateId,
    states: [{
      id: stateId,
      name: 'State',
      values: [{ id: id('state-opacity'), target: target('/appearance/opacity'), value: { type: 'number', value: 0.6 } }],
      entryActions: [],
      exitActions: [],
    }],
    transitions: [],
  };

  return model.createProjectV1({
    id: PROJECT_ID,
    documents: [{
      ...document,
      kind: 'motion',
      timebase: { frameRate: { numerator: 25, denominator: 1 }, ticksPerSecond: 1000, timecode: { nominalFramesPerSecond: 25, dropFrame: false } },
      pages: [{ ...page, sequenceId: pageSequenceId }],
      sequences: [
        sequence({ id: pageSequenceId, target: target('/appearance/opacity'), valueType: 'number', value: { type: 'number', value: 0.8 } }),
        sequence({ id: lifecycleSequenceId, target: target('/geometry/bounds/width'), valueType: 'length', value: { type: 'length', value: 200 } }),
      ],
      stateMachines: [machine],
      lifecycle: {
        id: id('composed-lifecycle'),
        in: [{ kind: 'play-sequence', sequenceId: lifecycleSequenceId, behavior: 'restart' }],
        hold: [],
        update: [],
        out: [],
      },
    }],
  });
}

describe('resolveSceneSnapshotV1', () => {
  it('resolves live values over selected sample data and preserves provenance', () => {
    const sampled = resolve();

    expect(sampled.status, JSON.stringify(sampled)).toBe('resolved');
    expect(sampled).toMatchObject({ status: 'resolved', snapshot: { nodes: [{ element: { appearance: { opacity: 0.5 } } }] } });

    const live = resolve([{ viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID, value: { type: 'number', value: 0.25 } }]);

    expect(live).toMatchObject({ status: 'resolved', snapshot: { data: { values: [{ viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID, value: { type: 'number', value: 0.25 } }] }, nodes: [{ element: { appearance: { opacity: 0.25 } } }] } });
    if (live.status !== 'resolved') return;

    const bindingProperty = live.snapshot.nodes[0]?.properties.find((property) =>
      property.contributions.some((contribution) => contribution.source.kind === 'binding' && contribution.source.bindingId === id('binding') && !contribution.source.usedFallback),
    );

    expect(bindingProperty).toBeDefined();
  });

  it('rejects unsafe ticks, future events, and schema-invalid live values without a partial scene', () => {
    expect(resolve([], -1)).toMatchObject({ status: 'invalid' });
    expect(resolveSceneSnapshotV1({ project: project(), documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 0, fieldValues: [], events: [{ kind: 'lifecycle', tick: 1, phase: 'in' }] })).toMatchObject({ status: 'invalid' });
    expect(resolve([{ viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID, value: { type: 'string', value: 'bad' } }])).toMatchObject({ status: 'invalid' });
  });

  it('is cold-seek deterministic, owns its output, and deep-freezes snapshots', () => {
    const direct = resolve([], 0);

    resolve([], 1);

    const backward = resolve([], 0);

    expect(backward).toEqual(direct);
    if (direct.status !== 'resolved') return;
    expect(Object.isFrozen(direct.snapshot)).toBe(true);
    expect(Object.isFrozen(direct.snapshot.nodes[0]?.element)).toBe(true);
    expect(direct.snapshot.nodes[0]?.element).not.toBe(project().documents[0]?.elements[0]);
  });

  it('keeps lifecycle OUT visible through its terminal tick and hides after completion', () => {
    const project = lifecycleProject();
    const atTerminal = resolveSceneSnapshotV1({ project, documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 2, fieldValues: [], events: [{ kind: 'lifecycle', tick: 0, phase: 'out' }] });
    const completed = resolveSceneSnapshotV1({ project, documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 3, fieldValues: [], events: [{ kind: 'lifecycle', tick: 0, phase: 'out' }] });

    expect(atTerminal).toMatchObject({ status: 'resolved', snapshot: { nodes: [{ visible: true }] } });
    expect(completed).toMatchObject({ status: 'resolved', snapshot: { nodes: [{ visible: false }] } });
  });

  it('uses the chronologically latest OUT event even when the caller event array is unsorted', () => {
    const project = lifecycleProject();
    const events = [
      { kind: 'lifecycle', tick: 10, phase: 'out' },
      { kind: 'lifecycle', tick: 0, phase: 'out' },
    ] as const;

    expect(resolveSceneSnapshotV1({ project, documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 12, fieldValues: [], events }))
      .toMatchObject({ status: 'resolved', snapshot: { nodes: [{ visible: true }] } });
    expect(resolveSceneSnapshotV1({ project, documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 13, fieldValues: [], events }))
      .toMatchObject({ status: 'resolved', snapshot: { nodes: [{ visible: false }] } });
  });

  it('restores visibility when a later lifecycle phase supersedes a completed OUT', () => {
    const project = lifecycleProject();
    const events = [
      { kind: 'lifecycle', tick: 0, phase: 'out' },
      { kind: 'lifecycle', tick: 4, phase: 'in' },
    ] as const;

    expect(resolveSceneSnapshotV1({ project, documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 4, fieldValues: [], events }))
      .toMatchObject({ status: 'resolved', snapshot: { nodes: [{ visible: true }] } });
  });

  it('evaluates resumed OUT completion from the preserved active sequence position', () => {
    const project = resumedLifecycleProject();
    const events = [{ kind: 'lifecycle', tick: 1, phase: 'out' }] as const;

    expect(resolveSceneSnapshotV1({ project, documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 2, fieldValues: [], events }))
      .toMatchObject({ status: 'resolved', snapshot: { nodes: [{ visible: true }] } });
    expect(resolveSceneSnapshotV1({ project, documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 3, fieldValues: [], events }))
      .toMatchObject({ status: 'resolved', snapshot: { nodes: [{ visible: false }] } });
  });

  it('hides a binding target when its missing field uses the hide stale policy', () => {
    const result = resolveSceneSnapshotV1({ project: hiddenStaleProject(), documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 0, fieldValues: [], events: [] });

    expect(result).toMatchObject({
      status: 'resolved',
      snapshot: {
        nodes: [{ visible: false }],
        fallbacks: [{ kind: 'stale-data', policy: 'hide' }],
      },
    });
  });

  it('hides the owning element when a nested binding target uses the hide stale policy', () => {
    const result = resolveSceneSnapshotV1({ project: nestedHiddenStaleProject(), documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 0, fieldValues: [], events: [] });

    expect(result).toMatchObject({ status: 'resolved', snapshot: { nodes: [{ visible: false }] } });
  });

  it('records a binding fallback against every resolved target address', () => {
    const result = resolveSceneSnapshotV1({ project: bindingFallbackProject(), documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 0, fieldValues: [], events: [] });

    expect(result).toMatchObject({ status: 'resolved', snapshot: { nodes: [{ element: { appearance: { opacity: 1 } } }] } });
    if (result.status !== 'resolved') return;

    const fallback = result.snapshot.fallbacks.find((candidate) => candidate.kind === 'binding-fallback');

    expect(fallback).toMatchObject({ kind: 'binding-fallback', bindingId: id('binding'), address: { rootInstanceId: ROOT_ID } });
    expect(result.snapshot.diagnostics).toContainEqual({
      code: 'playback.binding-fallback',
      severity: 'warning',
      message: 'Binding binding used its fallback value.',
    });
  });

  it('merges a document binding with the canonical page override provenance chain', () => {
    const result = resolveSceneSnapshotV1({ project: canonicalConflictProject(), documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 0, fieldValues: [], events: [] });

    expect(result).toMatchObject({ status: 'resolved', snapshot: { nodes: [{ element: { appearance: { opacity: 0.5 } } }] } });
    if (result.status !== 'resolved') return;

    const property = result.snapshot.nodes[0]?.properties.find((candidate) => candidate.target.pointer === '/appearance/opacity');

    expect(property?.contributions.map((contribution) => contribution.source.kind)).toEqual(['definition', 'page-override', 'binding']);
  });

  it('composes binding, state, page-sequence, and lifecycle-sequence evaluation in one snapshot', () => {
    const result = resolveSceneSnapshotV1({
      project: composedPlaybackProject(),
      documentId: DOCUMENT_ID,
      pageId: PAGE_ID,
      tick: 0,
      fieldValues: [],
      events: [{ kind: 'lifecycle', tick: 0, phase: 'in' }],
    });

    expect(result).toMatchObject({
      status: 'resolved',
      snapshot: { nodes: [{ element: { appearance: { opacity: 0.8 }, geometry: { bounds: { width: 200 } } } }] },
    });
    if (result.status !== 'resolved') return;

    const opacity = result.snapshot.nodes[0]?.properties.find((property) => property.target.pointer === '/appearance/opacity');

    expect(opacity?.contributions.map((contribution) => contribution.source.kind)).toEqual(['binding', 'state', 'sequence']);
  });

  it('rejects undeclared event IDs and accepts declared ones', () => {
    const project = eventProject();
    const options = { project, documentId: DOCUMENT_ID, pageId: PAGE_ID, tick: 0, fieldValues: [] } as const;

    expect(resolveSceneSnapshotV1({ ...options, events: [{ kind: 'event', tick: 0, stateMachineId: id('machine'), eventId: id('unknown-event') }] })).toMatchObject({ status: 'invalid' });
    expect(resolveSceneSnapshotV1({ ...options, events: [{ kind: 'event', tick: 0, stateMachineId: id('machine'), eventId: id('known-event') }] })).toMatchObject({ status: 'resolved' });
  });
});
