import type { projectFormatV1 as Model } from '@broadset/model';
import { projectFormatV1 } from '@broadset/model';

import {
  bindingContributionsV1,
  type PropertyContributionV1,
  type PropertyProvenanceV1,
  propertyTargetKeyV1,
  type ResolvedPropertyV1,
  resolvePropertyMapV1,
  stateContributionsV1,
} from './resolved-properties';
import { resolveRuntimeDataV1, runtimeFieldKeyV1, type RuntimeFieldValueV1 } from './runtime-data';
import { deriveActiveSequencesV1 } from './sequence-controls';
import { sampleSequenceV1 } from './sequence-sampler';
import { deriveStateSnapshotV1, type RuntimeStateEventV1, type ScheduledSequenceActionV1 } from './state-evaluator';
import { mapSequenceTickV1 } from './transport-mapping';

export interface SceneFieldValueV1 extends RuntimeFieldValueV1 {}

export type SceneRuntimeEventV1 =
  | {
      readonly kind: 'event';
      readonly tick: number;
      readonly stateMachineId: Model.Id;
      readonly eventId: Model.Id;
      readonly payload?: Model.TypedValue | undefined;
    }
  | { readonly kind: 'lifecycle'; readonly tick: number; readonly phase: 'in' | 'hold' | 'update' | 'out' };

export interface ResolveSceneSnapshotOptionsV1 {
  readonly project: Model.BroadsetProjectV1;
  readonly documentId: Model.Id;
  readonly pageId: Model.Id;
  readonly tick: number;
  readonly fieldValues: readonly SceneFieldValueV1[];
  readonly events: readonly SceneRuntimeEventV1[];
}

export type ResolvedSceneResultV1 =
  | { readonly status: 'resolved'; readonly snapshot: Model.ResolvedSceneSnapshotV1 }
  | { readonly status: 'invalid'; readonly diagnostics: readonly Model.Diagnostic[] };

type InternalResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly result: ResolvedSceneResultV1 };

function invalid(code: string, message: string): ResolvedSceneResultV1 {
  return { status: 'invalid', diagnostics: [{ code, severity: 'error', message }] };
}

function runtimeEvents(options: {
  readonly document: Model.BroadsetDocumentV1;
  readonly events: readonly SceneRuntimeEventV1[];
}): readonly RuntimeStateEventV1[] | undefined {
  const output: RuntimeStateEventV1[] = [];

  options.events.forEach((event, index) => {
    const id = projectFormatV1.idSchema.parse(`runtime-event-${String(index)}`);

    if (event.kind === 'event') {
      if (options.document.stateMachines.some((machine) => machine.id === event.stateMachineId)) {
        output.push({ id, tick: event.tick, stateMachineId: event.stateMachineId, input: { kind: 'event', eventId: event.eventId } });
      }

      return;
    }

    for (const machine of options.document.stateMachines) {
      output.push({ id, tick: event.tick, stateMachineId: machine.id, input: { kind: 'lifecycle', phase: event.phase } });
    }
  });

  const hasUnknownEvent = options.events.some((event) => {
    if (event.kind !== 'event') return false;

    const machine = options.document.stateMachines.find((candidate) => candidate.id === event.stateMachineId);

    return machine?.transitions.some((transition) => transition.trigger.kind === 'event' && transition.trigger.eventId === event.eventId) !== true;
  });

  return hasUnknownEvent ? undefined : output;
}

function lifecycleActions(options: {
  readonly document: Model.BroadsetDocumentV1;
  readonly events: readonly SceneRuntimeEventV1[];
}): readonly ScheduledSequenceActionV1[] {
  const lifecycle = options.document.lifecycle;

  if (lifecycle === undefined) return [];

  return options.events.flatMap((event) => {
    if (event.kind !== 'lifecycle') return [];

    return lifecycle[event.phase].map((action, actionIndex) => ({
      stateMachineId: lifecycle.id,
      eventId: lifecycle.id,
      startTick: event.tick,
      actionIndex,
      action,
    }));
  });
}

function lifecycleOutComplete(options: {
  readonly document: Model.BroadsetDocumentV1;
  readonly events: readonly SceneRuntimeEventV1[];
  readonly active: readonly { readonly sequence: Model.Sequence; readonly tick: number }[];
}): boolean {
  const lifecycleEvent = options.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.kind === 'lifecycle')
    .sort((left, right) => left.event.tick - right.event.tick || left.index - right.index)
    .at(-1)?.event;

  if (lifecycleEvent?.kind !== 'lifecycle' || lifecycleEvent.phase !== 'out' || options.document.lifecycle === undefined) return false;

  const sequenceIds = options.document.lifecycle.out.flatMap((action) => action.kind === 'play-sequence' ? [action.sequenceId] : []);

  if (sequenceIds.length === 0) return true;

  return sequenceIds.every((sequenceId) => {
    const active = options.active.find((candidate) => candidate.sequence.id === sequenceId);

    if (active === undefined) return false;

    const mapping = mapSequenceTickV1({ sequence: active.sequence, transportTick: active.tick });

    return mapping.status === 'resolved' && mapping.value.kind === 'time-out-of-range';
  });
}

function sequenceContributions(options: {
  readonly active: ReturnType<typeof deriveActiveSequencesV1>;
  readonly sequences: readonly Model.Sequence[];
}): InternalResult<readonly PropertyContributionV1[]> {
  const sequenceMap = new Map(options.sequences.map((sequence) => [sequence.id, sequence]));
  const contributions: PropertyContributionV1[] = [];

  for (const active of options.active) {
    const sampled = sampleSequenceV1({ sequence: active.sequence, transportTick: active.tick, sequences: sequenceMap });

    if (sampled.status === 'invalid') return { ok: false, result: { status: 'invalid', diagnostics: sampled.diagnostics } };
    if (sampled.value.kind === 'time-out-of-range') continue;
    sampled.value.values.forEach((sample, valueIndex) => contributions.push({
      target: sample.target,
      value: sample.value,
      tier: 'sequence',
      canonicalOrder: [active.canonicalOrder, valueIndex],
      provenance: { kind: 'sequence', ...sample.provenance },
    }));
  }

  return { ok: true, value: contributions };
}

function expressionUsesHiddenField(expression: Model.ExpressionAst, hiddenFields: ReadonlySet<string>): boolean {
  switch (expression.kind) {
    case 'field':
      return hiddenFields.has(runtimeFieldKeyV1(expression.viewModelId, expression.fieldId));
    case 'unary':
      return expressionUsesHiddenField(expression.operand, hiddenFields);
    case 'binary':
      return expressionUsesHiddenField(expression.left, hiddenFields) || expressionUsesHiddenField(expression.right, hiddenFields);
    case 'conditional':
      return expressionUsesHiddenField(expression.condition, hiddenFields)
        || expressionUsesHiddenField(expression.whenTrue, hiddenFields)
        || expressionUsesHiddenField(expression.whenFalse, hiddenFields);
    case 'get':
      return expressionUsesHiddenField(expression.source, hiddenFields);
    case 'index':
      return expressionUsesHiddenField(expression.source, hiddenFields) || expressionUsesHiddenField(expression.index, hiddenFields);
    case 'safe-function':
      return expression.arguments.some((argument) => expressionUsesHiddenField(argument, hiddenFields));
    default:
      return false;
  }
}

function hiddenBindingContributions(options: {
  readonly bindings: readonly Model.Binding[];
  readonly hiddenFields: ReadonlySet<string>;
  readonly scene: Model.ResolvedCanonicalSceneV1;
}): readonly PropertyContributionV1[] {
  return options.bindings.flatMap((binding, bindingIndex) => {
    if (!expressionUsesHiddenField(binding.expression, options.hiddenFields)) return [];

    return options.scene.nodes.flatMap((node) => {
      if (!targetMatchesNode({ target: binding.target, value: binding.fallback, node })) return [];

      const target = localizeTarget({ target: binding.target, node, pageId: options.scene.pageId });

      return [{
        target: {
          pointer: '/visible',
          entity: { ...target.entity, entityKind: 'element', entityId: node.address.elementId },
        },
        value: { type: 'boolean' as const, value: false },
        tier: 'binding' as const,
        canonicalOrder: [bindingIndex],
        provenance: { kind: 'binding' as const, bindingId: binding.id, source: 'fallback' as const },
      }];
    });
  });
}

function sourceFromProvenance(provenance: PropertyProvenanceV1): Model.SceneProvenanceSourceV1 {
  if (provenance.kind === 'binding') return { kind: 'binding', bindingId: provenance.bindingId, usedFallback: provenance.source === 'fallback' };
  if (provenance.kind === 'state') return provenance;

  return {
    kind: 'sequence',
    sequenceId: provenance.sequenceId,
    trackId: provenance.trackId,
    fromKeyframeId: provenance.fromKeyframeId,
    ...(provenance.toKeyframeId === undefined ? {} : { toKeyframeId: provenance.toKeyframeId }),
  };
}

function nodeOwnsNestedEntity(node: Model.ResolvedSceneNodeV1, target: Model.PropertyTarget): boolean {
  const entityId = target.entity.entityId;

  if (target.entity.entityKind === 'fill') return node.element.appearance.fills.some((candidate) => candidate.id === entityId);
  if (target.entity.entityKind === 'stroke') return node.element.appearance.strokes.some((candidate) => candidate.id === entityId);
  if (target.entity.entityKind === 'effect') return node.element.appearance.effects.some((candidate) => candidate.id === entityId);

  if (target.entity.entityKind === 'gradient-stop') {
    return [...node.element.appearance.fills, ...node.element.appearance.strokes]
      .some((layer) => layer.paint.kind === 'gradient' && layer.paint.gradient.stops.some((stop) => stop.id === entityId));
  }

  if (target.entity.entityKind === 'path-point') {
    return node.element.kind === 'vector'
      && node.element.geometryData.kind === 'path'
      && node.element.geometryData.path.points.some((point) => point.id === entityId);
  }

  if (target.entity.entityKind === 'paragraph') {
    return node.element.kind === 'text' && node.element.text.paragraphs.some((paragraph) => paragraph.id === entityId);
  }

  if (target.entity.entityKind === 'text-run') {
    return node.element.kind === 'text'
      && node.element.text.paragraphs.some((paragraph) => paragraph.runs.some((run) => run.id === entityId));
  }

  return false;
}

function targetMatchesNode(options: {
  readonly target: Model.PropertyTarget;
  readonly value?: Model.TypedValue | undefined;
  readonly node: Model.ResolvedSceneNodeV1;
}): boolean {
  const { target, node } = options;
  const path = target.entity.instancePath;
  const nodePath = [node.address.rootInstanceId, ...node.address.componentInstancePath];

  if (path !== undefined && (path.length !== nodePath.length || path.some((id, index) => id !== nodePath[index]))) return false;
  if (target.entity.entityKind === 'element') return target.entity.entityId === node.address.elementId;
  if (!nodeOwnsNestedEntity(node, target)) return false;

  return options.value === undefined || projectFormatV1.applyResolvedOverrideV1(node.element, target, options.value) !== undefined;
}

function localizeTarget(options: {
  readonly target: Model.PropertyTarget;
  readonly node: Model.ResolvedSceneNodeV1;
  readonly pageId: Model.Id;
}): Model.PropertyTarget {
  return {
    pointer: options.target.pointer,
    entity: {
      ...options.target.entity,
      pageId: options.pageId,
      instancePath: [options.node.address.rootInstanceId, ...options.node.address.componentInstancePath],
    },
  };
}

function expandContributions(options: {
  readonly contributions: readonly PropertyContributionV1[];
  readonly scene: Model.ResolvedCanonicalSceneV1;
}): readonly PropertyContributionV1[] {
  return options.contributions.flatMap((contribution) => {
    if (contribution.target.entity.pageId !== undefined && contribution.target.entity.pageId !== options.scene.pageId) return [];

    return options.scene.nodes.flatMap((node) => targetMatchesNode({ target: contribution.target, value: contribution.value, node })
      ? [{ ...contribution, target: localizeTarget({ target: contribution.target, node, pageId: options.scene.pageId }) }]
      : []);
  });
}

function bindingFallbacks(options: {
  readonly contributions: readonly PropertyContributionV1[];
  readonly scene: Model.ResolvedCanonicalSceneV1;
}): readonly Extract<Model.ResolvedSceneFallbackV1, { readonly kind: 'binding-fallback' }>[] {
  return options.contributions.flatMap((contribution) => {
    if (contribution.provenance.kind !== 'binding' || contribution.provenance.source !== 'fallback') return [];

    const bindingId = contribution.provenance.bindingId;

    return options.scene.nodes.flatMap((node) => {
      if (!targetMatchesNode({ target: contribution.target, value: contribution.value, node })) return [];

      return [{
        kind: 'binding-fallback' as const,
        address: node.address,
        bindingId,
        target: localizeTarget({ target: contribution.target, node, pageId: options.scene.pageId }),
        diagnostic: {
          code: 'playback.binding-fallback',
          severity: 'warning' as const,
          message: `Binding ${String(bindingId)} used its fallback value.`,
        },
      }];
    });
  });
}

function addressKey(address: Model.ResolvedSceneAddressV1 | null): string {
  return address === null ? '' : `${String(address.rootInstanceId)}\u0000${address.componentInstancePath.join('\u001f')}\u0000${String(address.elementId)}`;
}

interface NodePlaybackState {
  readonly element: Model.Element;
  readonly visible: boolean;
  readonly properties: readonly Model.ResolvedScenePropertyV1[];
}

function applyNodeProperty(options: {
  readonly state: NodePlaybackState;
  readonly property: ResolvedPropertyV1;
}): InternalResult<NodePlaybackState> {
  let { element, visible } = options.state;

  if (options.property.target.pointer === '/visible' && options.property.value.type === 'boolean') {
    visible = options.property.value.value;
  } else {
    const applied = projectFormatV1.applyResolvedOverrideV1(element, options.property.target, options.property.value);

    if (applied === undefined) return { ok: false, result: invalid('playback.invalid-property-target', `Playback could not apply ${options.property.target.pointer} to ${String(options.property.target.entity.entityId)}.`) };

    element = applied;
  }

  const contributions = [
    ...options.property.overridden.map((entry) => ({ value: entry.value, source: sourceFromProvenance(entry.provenance) })),
    { value: options.property.value, source: sourceFromProvenance(options.property.provenance) },
  ];
  const properties = [...options.state.properties];
  const key = propertyTargetKeyV1(options.property.target);
  const existingIndex = properties.findIndex((candidate) => propertyTargetKeyV1(candidate.target) === key);
  const resolvedProperty: Model.ResolvedScenePropertyV1 = { target: options.property.target, contributions, value: options.property.value };

  if (existingIndex === -1) properties.push(resolvedProperty);
  else properties[existingIndex] = { ...resolvedProperty, contributions: [...(properties[existingIndex]?.contributions ?? []), ...contributions] };

  return { ok: true, value: { element, visible, properties } };
}

function applyProperties(options: {
  readonly scene: Model.ResolvedCanonicalSceneV1;
  readonly properties: ReadonlyMap<string, ResolvedPropertyV1>;
}): InternalResult<readonly Model.ResolvedSceneNodeV1[]> {
  const nodes: Model.ResolvedSceneNodeV1[] = [];
  const byAddress = new Map<string, Model.ResolvedSceneNodeV1>();

  for (const node of options.scene.nodes) {
    let state: NodePlaybackState = { element: node.element, visible: node.visible, properties: node.properties };

    for (const property of options.properties.values()) {
      if (!targetMatchesNode({ target: property.target, value: property.value, node })) continue;

      const applied = applyNodeProperty({ state, property });

      if (!applied.ok) return applied;

      state = applied.value;
    }

    const localGeometry = state.element.geometry;
    const parentTransform = byAddress.get(addressKey(node.parentAddress))?.worldGeometry.transform;
    const worldGeometry = projectFormatV1.resolveWorldGeometryV1(localGeometry, parentTransform);
    const resolvedNode = { ...node, element: state.element, localGeometry, worldGeometry, visible: state.visible, properties: state.properties };

    nodes.push(resolvedNode);
    byAddress.set(addressKey(node.address), resolvedNode);
  }

  return { ok: true, value: nodes };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }

  return value;
}

export function resolveSceneSnapshotV1(options: ResolveSceneSnapshotOptionsV1): ResolvedSceneResultV1 {
  if (!Number.isSafeInteger(options.tick) || options.tick < 0) return invalid('playback.invalid-tick', 'Scene tick must be a non-negative safe integer.');
  if (options.events.some((event) => !Number.isSafeInteger(event.tick) || event.tick < 0 || event.tick > options.tick)) return invalid('playback.invalid-event-tick', 'Runtime events must use safe ticks no later than the scene tick.');

  const canonical = projectFormatV1.resolveCanonicalSceneV1({ project: options.project, documentId: options.documentId, pageId: options.pageId });

  if (canonical.status === 'invalid') return canonical;

  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);
  const page = document?.pages.find((candidate) => candidate.id === options.pageId);

  if (document === undefined || page === undefined) return invalid('playback.invalid-selection', 'Selected document or page does not exist.');

  const data = resolveRuntimeDataV1({ project: options.project, document, page, fieldValues: options.fieldValues });

  if (data.status === 'invalid') return data;

  const events = runtimeEvents({ document, events: options.events });

  if (events === undefined) return invalid('playback.unknown-runtime-event', 'A runtime event references an unknown state machine or undeclared event ID.');

  const state = deriveStateSnapshotV1({ machines: document.stateMachines, eventLog: events, context: data.value.context, tick: options.tick });

  if (state.status === 'invalid') return state;

  const active = deriveActiveSequencesV1({
    sequences: document.sequences,
    pageSequenceId: page.sequenceId,
    actions: [...state.value.sequenceActions, ...lifecycleActions({ document, events: options.events })],
    tick: options.tick,
  });
  const sequences = sequenceContributions({ active, sequences: document.sequences });

  if (!sequences.ok) return sequences.result;

  const machineStates = state.value.machineStates.flatMap((derived) => {
    const machine = document.stateMachines.find((candidate) => candidate.id === derived.stateMachineId);

    return machine === undefined ? [] : [{ machine, stateId: derived.stateId }];
  });
  const bindings = bindingContributionsV1(document.bindings, data.value.context);
  const contributions = [
    ...bindings,
    ...hiddenBindingContributions({ bindings: document.bindings, hiddenFields: data.value.hiddenFields, scene: canonical.scene }),
    ...stateContributionsV1(machineStates),
    ...sequences.value,
  ];
  const localizedContributions = expandContributions({ contributions, scene: canonical.scene });
  const nodes = applyProperties({ scene: canonical.scene, properties: resolvePropertyMapV1(localizedContributions) });

  if (!nodes.ok) return nodes.result;

  const bindingFallbackRecords = bindingFallbacks({ contributions: bindings, scene: canonical.scene });

  const snapshot: Model.ResolvedSceneSnapshotV1 = {
    ...canonical.scene,
    tick: options.tick,
    nodes: lifecycleOutComplete({ document, events: options.events, active })
      ? nodes.value.map((node) => ({ ...node, visible: false }))
      : nodes.value,
    data: { ...canonical.scene.data, values: data.value.values },
    fallbacks: [...canonical.scene.fallbacks, ...data.value.fallbacks, ...bindingFallbackRecords],
    diagnostics: [
      ...canonical.scene.diagnostics,
      ...data.value.fallbacks.map((fallback) => fallback.diagnostic),
      ...bindingFallbackRecords.map((fallback) => fallback.diagnostic),
    ],
  };

  return { status: 'resolved', snapshot: deepFreeze(structuredClone(snapshot)) };
}
