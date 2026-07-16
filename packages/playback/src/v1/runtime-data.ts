import type { projectFormatV1 as Model } from '@broadset/model';
import { projectFormatV1 } from '@broadset/model';

import { invalidEvaluationV1, type PlaybackEvaluationResultV1, resolvedEvaluationV1 } from './evaluation-result';
import type { ExpressionContextV1 } from './expression-eval';

export interface RuntimeFieldValueV1 {
  readonly viewModelId: Model.Id;
  readonly fieldId: Model.Id;
  readonly value: Model.TypedValue;
}

export interface ResolvedRuntimeDataV1 {
  readonly values: readonly RuntimeFieldValueV1[];
  readonly context: ExpressionContextV1;
  readonly fallbacks: readonly Extract<Model.ResolvedSceneFallbackV1, { readonly kind: 'stale-data' }>[];
  readonly hiddenFields: ReadonlySet<string>;
}

export function runtimeFieldKeyV1(viewModelId: Model.Id, fieldId: Model.Id): string {
  return `${String(viewModelId)}\u0000${String(fieldId)}`;
}

function staleFallback(options: {
  readonly viewModelId: Model.Id;
  readonly fieldId: Model.Id;
  readonly policy: NonNullable<Model.ViewModelField['stalePolicy']>;
}): Extract<Model.ResolvedSceneFallbackV1, { readonly kind: 'stale-data' }> {
  return {
    kind: 'stale-data',
    ...options,
    diagnostic: {
      code: 'playback.stale-data',
      severity: options.policy === 'error' ? 'error' : 'warning',
      message: `No live or selected sample value is available for field ${String(options.fieldId)}.`,
    },
  };
}

function resolveVariableContext(options: {
  readonly project: Model.BroadsetProjectV1;
  readonly selectedModes: Readonly<Record<Model.Id, Model.Id>>;
  readonly fieldValues: ReadonlyMap<string, Model.TypedValue>;
}): ExpressionContextV1 {
  const collections = new Map(options.project.resources.variables.map((collection) => [collection.id, collection]));
  const resolveVariable = (collectionId: Model.Id, variableId: Model.Id, visited: ReadonlySet<string>): Model.TypedValue | undefined => {
    const key = runtimeFieldKeyV1(collectionId, variableId);

    if (visited.has(key)) return undefined;

    const collection = collections.get(collectionId);
    const variable = collection?.variables.find((candidate) => candidate.id === variableId);

    if (collection === undefined || variable === undefined) return undefined;
    if (variable.aliasOf !== undefined) return resolveVariable(variable.aliasOf.collectionId, variable.aliasOf.variableId, new Set(visited).add(key));

    const modeId = options.selectedModes[collectionId] ?? collection.defaultModeId;

    return variable.valuesByMode[modeId];
  };

  return {
    resolveField: (viewModelId, fieldId) => options.fieldValues.get(runtimeFieldKeyV1(viewModelId, fieldId)),
    resolveVariable: (collectionId, variableId) => resolveVariable(collectionId, variableId, new Set()),
  };
}

function collectLiveValues(options: {
  readonly document: Model.BroadsetDocumentV1;
  readonly fieldValues: readonly RuntimeFieldValueV1[];
}): PlaybackEvaluationResultV1<ReadonlyMap<string, Model.TypedValue>> {
  const live = new Map<string, Model.TypedValue>();

  for (const entry of options.fieldValues) {
    const viewModel = options.document.viewModels.find((candidate) => candidate.id === entry.viewModelId);
    const field = viewModel?.fields.find((candidate) => candidate.id === entry.fieldId);
    const key = runtimeFieldKeyV1(entry.viewModelId, entry.fieldId);

    if (field === undefined) return invalidEvaluationV1({ code: 'playback.unknown-runtime-field', message: `Runtime field ${key} is not declared.` });
    if (live.has(key)) return invalidEvaluationV1({ code: 'playback.duplicate-runtime-field', message: `Runtime field ${key} is duplicated.` });
    if (!projectFormatV1.typedValueMatchesSchema(entry.value, field.schema)) return invalidEvaluationV1({ code: 'playback.invalid-runtime-value', message: `Runtime field ${key} does not match its schema.` });

    live.set(key, entry.value);
  }

  return resolvedEvaluationV1(live);
}

interface FieldResolution {
  readonly value?: Model.TypedValue | undefined;
  readonly fallback?: Extract<Model.ResolvedSceneFallbackV1, { readonly kind: 'stale-data' }> | undefined;
  readonly hidden: boolean;
}

function resolveField(options: {
  readonly viewModel: Model.ViewModel;
  readonly field: Model.ViewModelField;
  readonly sample?: Model.SampleDataSet | undefined;
  readonly live: ReadonlyMap<string, Model.TypedValue>;
}): PlaybackEvaluationResultV1<FieldResolution> {
  const key = runtimeFieldKeyV1(options.viewModel.id, options.field.id);
  const available = options.live.get(key) ?? options.sample?.values[options.field.id];

  if (available !== undefined) return resolvedEvaluationV1({ value: available, hidden: false });

  const policy = options.field.stalePolicy ?? 'use-default';
  const fallback = staleFallback({ viewModelId: options.viewModel.id, fieldId: options.field.id, policy });

  if (policy === 'error') return { status: 'invalid', diagnostics: [fallback.diagnostic] };

  // Cold keep-last evaluation has no prior state, so it uses the declared default and records staleness.
  return resolvedEvaluationV1({ value: options.field.defaultValue, fallback, hidden: policy === 'hide' });
}

function recordFieldResolution(options: {
  readonly viewModelId: Model.Id;
  readonly fieldId: Model.Id;
  readonly resolution: FieldResolution;
  readonly resolved: Map<string, Model.TypedValue>;
  readonly values: RuntimeFieldValueV1[];
  readonly fallbacks: Extract<Model.ResolvedSceneFallbackV1, { readonly kind: 'stale-data' }>[];
  readonly hiddenFields: Set<string>;
}): void {
  const key = runtimeFieldKeyV1(options.viewModelId, options.fieldId);

  if (options.resolution.fallback !== undefined) options.fallbacks.push(options.resolution.fallback);
  if (options.resolution.hidden) options.hiddenFields.add(key);
  if (options.resolution.value === undefined) return;

  options.resolved.set(key, options.resolution.value);
  options.values.push({ viewModelId: options.viewModelId, fieldId: options.fieldId, value: options.resolution.value });
}

export function resolveRuntimeDataV1(options: {
  readonly project: Model.BroadsetProjectV1;
  readonly document: Model.BroadsetDocumentV1;
  readonly page: Model.PageDefinition;
  readonly fieldValues: readonly RuntimeFieldValueV1[];
}): PlaybackEvaluationResultV1<ResolvedRuntimeDataV1> {
  const live = collectLiveValues({ document: options.document, fieldValues: options.fieldValues });

  if (live.status === 'invalid') return live;

  const resolved = new Map<string, Model.TypedValue>();
  const values: RuntimeFieldValueV1[] = [];
  const fallbacks: Extract<Model.ResolvedSceneFallbackV1, { readonly kind: 'stale-data' }>[] = [];
  const hiddenFields = new Set<string>();

  for (const viewModel of options.document.viewModels) {
    const selectedId = options.page.selectedSampleDataSets[viewModel.id];
    const sample = viewModel.sampleDataSets.find((candidate) => candidate.id === selectedId);

    for (const field of viewModel.fields) {
      const fieldResult = resolveField({ viewModel, field, sample, live: live.value });

      if (fieldResult.status === 'invalid') return fieldResult;

      recordFieldResolution({
        viewModelId: viewModel.id,
        fieldId: field.id,
        resolution: fieldResult.value,
        resolved,
        values,
        fallbacks,
        hiddenFields,
      });
    }
  }

  const selectedModes = { ...options.document.selectedVariableModes, ...options.page.selectedVariableModes };

  return resolvedEvaluationV1({
    values,
    context: resolveVariableContext({ project: options.project, selectedModes, fieldValues: resolved }),
    fallbacks,
    hiddenFields,
  });
}
