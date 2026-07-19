import type { Effect, FillLayer, GradientStop, StrokeLayer } from './appearance';
import type { ComponentDefinition } from './component';
import type { BroadsetDocumentV1 } from './document';
import type { Element, PathPoint } from './element';
import type { Id } from './identity';
import type { BroadsetProjectV1 } from './project';
import type { Sequence } from './sequence';
import type { TextParagraph, TextRun } from './text';

interface OwnedEntity<T> {
  readonly value: T;
  readonly ownerElementId: Id;
}

export interface ElementNestedIndexes {
  readonly paragraphs: ReadonlyMap<Id, readonly OwnedEntity<TextParagraph>[]>;
  readonly textRuns: ReadonlyMap<Id, readonly OwnedEntity<TextRun>[]>;
  readonly fills: ReadonlyMap<Id, readonly OwnedEntity<FillLayer>[]>;
  readonly strokes: ReadonlyMap<Id, readonly OwnedEntity<StrokeLayer>[]>;
  readonly effects: ReadonlyMap<Id, readonly OwnedEntity<Effect>[]>;
  readonly gradientStops: ReadonlyMap<Id, readonly OwnedEntity<GradientStop>[]>;
  readonly pathPoints: ReadonlyMap<Id, readonly OwnedEntity<PathPoint>[]>;
}

interface ViewModelSemanticIndex {
  readonly viewModel: BroadsetDocumentV1['viewModels'][number];
  readonly fields: ReadonlyMap<string, BroadsetDocumentV1['viewModels'][number]['fields'][number]>;
  readonly sampleDataSets: ReadonlySet<Id>;
}

export interface ComponentSemanticIndex {
  readonly component: ComponentDefinition;
  readonly elements: ReadonlyMap<Id, Element>;
  readonly sequences: ReadonlyMap<Id, Sequence>;
  readonly exposedProperties: ReadonlyMap<Id, ComponentDefinition['exposedProperties'][number]>;
  readonly nestedEntities: ElementNestedIndexes;
}

export interface DocumentSemanticIndex {
  readonly projectId: Id;
  readonly document: BroadsetDocumentV1;
  readonly elements: ReadonlyMap<Id, Element>;
  readonly components: ReadonlyMap<Id, ComponentSemanticIndex>;
  readonly sequences: ReadonlyMap<Id, Sequence>;
  readonly pages: ReadonlyMap<Id, BroadsetDocumentV1['pages'][number]>;
  readonly pageRoots: ReadonlyMap<Id, ReadonlyMap<Id, BroadsetDocumentV1['pages'][number]['rootInstances'][number]>>;
  readonly stateMachines: ReadonlyMap<Id, BroadsetDocumentV1['stateMachines'][number]>;
  readonly viewModels: ReadonlyMap<string, ViewModelSemanticIndex>;
  readonly bindings: ReadonlySet<Id>;
  readonly guides: ReadonlyMap<Id, BroadsetDocumentV1['surface']['guides'][number]>;
  readonly nestedEntities: ElementNestedIndexes;
}

export interface SemanticIndexes {
  readonly project: BroadsetProjectV1;
  readonly assets: ReadonlyMap<Id, BroadsetProjectV1['resources']['assets'][number]>;
  readonly fonts: ReadonlyMap<Id, BroadsetProjectV1['resources']['fonts'][number]>;
  readonly fontFaces: ReadonlyMap<Id, ReadonlySet<Id>>;
  readonly swatches: ReadonlyMap<Id, BroadsetProjectV1['resources']['swatches'][number]>;
  readonly variables: ReadonlyMap<Id, BroadsetProjectV1['resources']['variables'][number]>;
  readonly styles: ReadonlyMap<Id, BroadsetProjectV1['resources']['styles'][number]>;
  readonly outputProfiles: ReadonlyMap<Id, BroadsetProjectV1['resources']['outputProfiles'][number]>;
  readonly variableModes: ReadonlyMap<string, ReadonlySet<Id>>;
  readonly variableDefinitions: ReadonlyMap<Id, ReadonlyMap<Id, BroadsetProjectV1['resources']['variables'][number]['variables'][number]>>;
  readonly templateGroups: ReadonlySet<Id>;
  readonly interopSources: ReadonlySet<Id>;
  readonly interopRecords: ReadonlySet<Id>;
  readonly documents: ReadonlyMap<Id, DocumentSemanticIndex>;
  readonly documentList: readonly DocumentSemanticIndex[];
}

function indexById<T extends { readonly id: Id }>(items: readonly T[]): ReadonlyMap<Id, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function addOwnedEntity<T>({
  index,
  id,
  value,
  ownerElementId,
}: {
  readonly index: Map<Id, OwnedEntity<T>[]>;
  readonly id: Id;
  readonly value: T;
  readonly ownerElementId: Id;
}): void {
  const entries = index.get(id) ?? [];

  entries.push({ value, ownerElementId });
  index.set(id, entries);
}

export function createElementNestedIndexes(elements: readonly Element[]): ElementNestedIndexes {
  const paragraphs = new Map<Id, OwnedEntity<TextParagraph>[]>();
  const textRuns = new Map<Id, OwnedEntity<TextRun>[]>();
  const fills = new Map<Id, OwnedEntity<FillLayer>[]>();
  const strokes = new Map<Id, OwnedEntity<StrokeLayer>[]>();
  const effects = new Map<Id, OwnedEntity<Effect>[]>();
  const gradientStops = new Map<Id, OwnedEntity<GradientStop>[]>();
  const pathPoints = new Map<Id, OwnedEntity<PathPoint>[]>();

  elements.forEach((element) => {
    element.appearance.fills.forEach((fill) => {
      addOwnedEntity({ index: fills, id: fill.id, value: fill, ownerElementId: element.id });
      if (fill.paint.kind === 'gradient') fill.paint.gradient.stops.forEach((stop) => {
        addOwnedEntity({ index: gradientStops, id: stop.id, value: stop, ownerElementId: element.id });
      });
    });
    element.appearance.strokes.forEach((stroke) => {
      addOwnedEntity({ index: strokes, id: stroke.id, value: stroke, ownerElementId: element.id });
      if (stroke.paint.kind === 'gradient') stroke.paint.gradient.stops.forEach((stop) => {
        addOwnedEntity({ index: gradientStops, id: stop.id, value: stop, ownerElementId: element.id });
      });
    });
    element.appearance.effects.forEach((effect) => { addOwnedEntity({ index: effects, id: effect.id, value: effect, ownerElementId: element.id }); });
    if (element.kind === 'text') element.text.paragraphs.forEach((paragraph) => {
      addOwnedEntity({ index: paragraphs, id: paragraph.id, value: paragraph, ownerElementId: element.id });
      paragraph.runs.forEach((run) => { addOwnedEntity({ index: textRuns, id: run.id, value: run, ownerElementId: element.id }); });
    });

    if (element.kind === 'vector' && element.geometryData.kind === 'path') {
      element.geometryData.path.points.forEach((point) => { addOwnedEntity({ index: pathPoints, id: point.id, value: point, ownerElementId: element.id }); });
    }
  });

  return { paragraphs, textRuns, fills, strokes, effects, gradientStops, pathPoints };
}

function createComponentIndex(component: ComponentDefinition): ComponentSemanticIndex {
  return {
    component,
    elements: indexById(component.elements),
    sequences: indexById(component.sequences),
    exposedProperties: indexById(component.exposedProperties),
    nestedEntities: createElementNestedIndexes(component.elements),
  };
}

function createViewModelIndex(viewModel: BroadsetDocumentV1['viewModels'][number]): ViewModelSemanticIndex {
  return {
    viewModel,
    fields: new Map<string, BroadsetDocumentV1['viewModels'][number]['fields'][number]>(
      viewModel.fields.map((field) => [field.id, field]),
    ),
    sampleDataSets: new Set(viewModel.sampleDataSets.map(({ id }) => id)),
  };
}

function createDocumentIndex(projectId: Id, document: BroadsetDocumentV1): DocumentSemanticIndex {
  const components = document.components.map((component) => [component.id, createComponentIndex(component)] as const);
  const pages = indexById(document.pages);

  return {
    projectId,
    document,
    elements: indexById(document.elements),
    components: new Map(components),
    sequences: indexById(document.sequences),
    pages,
    pageRoots: new Map(document.pages.map((page) => [page.id, indexById(page.rootInstances)])),
    stateMachines: indexById(document.stateMachines),
    viewModels: new Map<string, ViewModelSemanticIndex>(
      document.viewModels.map((viewModel) => [viewModel.id, createViewModelIndex(viewModel)]),
    ),
    bindings: new Set(document.bindings.map(({ id }) => id)),
    guides: indexById(document.surface.guides),
    nestedEntities: createElementNestedIndexes(document.elements),
  };
}

export function createSemanticIndexes(project: BroadsetProjectV1): SemanticIndexes {
  const documentList = project.documents.map((document) => createDocumentIndex(project.id, document));

  return {
    project,
    assets: indexById(project.resources.assets),
    fonts: indexById(project.resources.fonts),
    fontFaces: new Map(project.resources.fonts.map((family) => [
      family.id,
      new Set(family.faces.map(({ id }) => id)),
    ])),
    swatches: indexById(project.resources.swatches),
    variables: indexById(project.resources.variables),
    styles: indexById(project.resources.styles),
    outputProfiles: indexById(project.resources.outputProfiles),
    variableModes: new Map<string, ReadonlySet<Id>>(project.resources.variables.map((collection) => [
      collection.id,
      new Set(collection.modes.map(({ id }) => id)),
    ])),
    variableDefinitions: new Map(project.resources.variables.map((collection) => [
      collection.id,
      indexById(collection.variables),
    ])),
    templateGroups: new Set(project.templateGroups.map(({ id }) => id)),
    interopSources: new Set(project.interop.sources.map(({ id }) => id)),
    interopRecords: new Set(project.interop.records.map(({ id }) => id)),
    documents: new Map(documentList.map((documentIndex) => [documentIndex.document.id, documentIndex])),
    documentList,
  };
}
