import { projectFormatV1 } from '@broadset/model';
import type { GuardDraft } from '@broadset/ui';

const TICKS_PER_SECOND = 1000;
const SEQUENCE_DURATION_TICKS = 2000;

export function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

interface ProjectFixture {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly viewModelId: projectFormatV1.Id;
  readonly boolFieldId: projectFormatV1.Id;
  readonly stringFieldId: projectFormatV1.Id;
  readonly enumFieldId: projectFormatV1.Id;
  readonly numberFieldId: projectFormatV1.Id;
  readonly integerFieldId: projectFormatV1.Id;
  readonly dateFieldId: projectFormatV1.Id;
  readonly colorFieldId: projectFormatV1.Id;
  readonly collectionId: projectFormatV1.Id;
  readonly scoreVariableId: projectFormatV1.Id;
  readonly flagVariableId: projectFormatV1.Id;
  readonly lengthVariableId: projectFormatV1.Id;
  readonly sequenceId: projectFormatV1.Id;
  readonly notifierMachineId: projectFormatV1.Id;
  readonly notifyEventId: projectFormatV1.Id;
}

interface ProjectFixtureOptions {
  readonly guard?: projectFormatV1.ExpressionAst;
  readonly actions?: readonly projectFormatV1.SequenceAction[];
}

/**
 * Builds a full, semantically-valid motion project with a view model, project variables, two
 * sequences-worth of state-machine plumbing, and a guarded transition whose guard/actions are
 * injected by the caller. Used both for pure translation-function tests (which only read
 * `document.viewModels` / `project.resources.variables`) and for the semantic-validity tests, which
 * need the whole graph to resolve.
 */
export function buildProjectFixture(options: ProjectFixtureOptions): ProjectFixture {
  const timestamp = projectFormatV1.utcTimestampSchema.parse('2025-01-01T00:00:00Z');
  const viewModelId = id('vm-live');
  const boolFieldId = id('field-bool');
  const stringFieldId = id('field-str');
  const enumFieldId = id('field-enum');
  const numberFieldId = id('field-num');
  const integerFieldId = id('field-int');
  const dateFieldId = id('field-date');
  const colorFieldId = id('field-color');
  const collectionId = id('vars-globals');
  const modeId = id('mode-default');
  const scoreVariableId = id('var-score');
  const flagVariableId = id('var-flag');
  const lengthVariableId = id('var-length');
  const sequenceId = id('seq-intro');
  const primaryMachineId = id('machine-primary');
  const notifierMachineId = id('machine-notifier');
  const notifyEventId = id('evt-notify');
  const triggerEventId = id('evt-trigger');
  const sourceStateId = id('state-source');
  const targetStateId = id('state-target');
  const notifierSourceId = id('state-notify-source');
  const notifierTargetId = id('state-notify-target');

  const document: projectFormatV1.BroadsetDocumentV1 = {
    id: id('document'),
    name: 'Guard fixture document',
    kind: 'motion',
    timebase: {
      frameRate: { numerator: 25, denominator: 1 },
      ticksPerSecond: TICKS_PER_SECOND,
      timecode: { nominalFramesPerSecond: 25, dropFrame: false },
    },
    surface: {
      size: [1920, 1080],
      unit: 'px',
      dpi: 96,
      coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down' },
      background: { kind: 'none' },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      guides: [],
      broadcastSafeAreas: [],
    },
    color: { workingSpace: { kind: 'named', space: 'srgb' }, compositing: 'linear-premultiplied' },
    elements: [],
    components: [],
    pages: [
      {
        id: id('page'),
        name: 'Page 1',
        rootInstances: [],
        descendantOverrides: [],
        selectedVariableModes: {},
        selectedSampleDataSets: {},
        extensions: [],
      },
    ],
    sequences: [
      {
        id: sequenceId,
        name: 'Intro',
        durationTicks: SEQUENCE_DURATION_TICKS,
        loop: { kind: 'none' },
        tracks: [],
        markers: [],
        cues: [],
        childClips: [],
      },
    ],
    stateMachines: [
      {
        id: primaryMachineId,
        name: 'Primary',
        initialStateId: sourceStateId,
        states: [
          { id: sourceStateId, name: 'Source', values: [], entryActions: [], exitActions: [] },
          { id: targetStateId, name: 'Target', values: [], entryActions: [], exitActions: [] },
        ],
        transitions: [
          {
            id: id('transition-primary'),
            sourceStateId,
            targetStateId,
            trigger: { kind: 'event', eventId: triggerEventId },
            ...(options.guard === undefined ? {} : { guard: options.guard }),
            priority: 0,
            actions: options.actions ?? [],
          },
        ],
      },
      {
        id: notifierMachineId,
        name: 'Notifier',
        initialStateId: notifierSourceId,
        states: [
          { id: notifierSourceId, name: 'Idle', values: [], entryActions: [], exitActions: [] },
          { id: notifierTargetId, name: 'Notified', values: [], entryActions: [], exitActions: [] },
        ],
        transitions: [
          {
            id: id('transition-notifier'),
            sourceStateId: notifierSourceId,
            targetStateId: notifierTargetId,
            trigger: { kind: 'event', eventId: notifyEventId },
            priority: 0,
            actions: [],
          },
        ],
      },
    ],
    viewModels: [
      {
        id: viewModelId,
        name: 'Live Data',
        fields: [
          { id: boolFieldId, name: 'showBranding', label: 'Show Branding', schema: { kind: 'boolean' } },
          { id: stringFieldId, name: 'teamName', label: 'Team Name', schema: { kind: 'string' } },
          { id: enumFieldId, name: 'period', label: 'Period', schema: { kind: 'enum', values: ['first', 'second'] } },
          { id: numberFieldId, name: 'margin', label: 'Margin', schema: { kind: 'number' } },
          { id: integerFieldId, name: 'fouls', schema: { kind: 'integer' } },
          { id: dateFieldId, name: 'kickoff', label: 'Kickoff', schema: { kind: 'date-time' } },
          { id: colorFieldId, name: 'accent', label: 'Accent', schema: { kind: 'color' } },
        ],
        sampleDataSets: [],
      },
    ],
    bindings: [],
    selectedVariableModes: {},
    outputProfileIds: [],
    extensions: [],
  };

  const project: projectFormatV1.BroadsetProjectV1 = {
    $schema: 'https://schema.broadset.dev/v1/project.schema.json',
    format: 'broadset-project',
    schemaVersion: 1,
    id: id('project'),
    metadata: { name: 'Guard fixture project', createdAt: timestamp, updatedAt: timestamp },
    resources: {
      assets: [],
      fonts: [],
      swatches: [],
      variables: [
        {
          id: collectionId,
          name: 'Globals',
          modes: [{ id: modeId, name: 'Default' }],
          defaultModeId: modeId,
          variables: [
            {
              id: scoreVariableId,
              name: 'Score',
              valueType: 'number',
              valuesByMode: { [modeId]: { type: 'number', value: 0 } },
            },
            {
              id: flagVariableId,
              name: 'Ready',
              valueType: 'boolean',
              valuesByMode: { [modeId]: { type: 'boolean', value: false } },
            },
            {
              id: lengthVariableId,
              name: 'Margin',
              valueType: 'length',
              valuesByMode: { [modeId]: { type: 'length', value: 0 } },
            },
          ],
        },
      ],
      styles: [],
      outputProfiles: [],
    },
    documents: [document],
    templateGroups: [],
    interop: { sources: [], records: [] },
    extensions: [],
  };

  return {
    project,
    document,
    viewModelId,
    boolFieldId,
    stringFieldId,
    enumFieldId,
    numberFieldId,
    integerFieldId,
    dateFieldId,
    colorFieldId,
    collectionId,
    scoreVariableId,
    flagVariableId,
    lengthVariableId,
    sequenceId,
    notifierMachineId,
    notifyEventId,
  };
}

export function stripClauseIds(guard: GuardDraft): {
  readonly connective: GuardDraft['connective'];
  readonly clauses: readonly Omit<GuardDraft['clauses'][number], 'id'>[];
} {
  return { connective: guard.connective, clauses: guard.clauses.map(({ id: _clauseId, ...rest }) => rest) };
}
