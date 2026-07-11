import type { ComponentDefinition } from './component';
import type { BroadsetDocumentV1 } from './document';
import type { Element } from './element';
import type { Id } from './identity';
import type { BroadsetProjectV1 } from './project';
import type { Sequence } from './sequence';

export interface ComponentSemanticIndex {
  readonly component: ComponentDefinition;
  readonly elements: ReadonlyMap<Id, Element>;
  readonly sequences: ReadonlyMap<Id, Sequence>;
}

export interface DocumentSemanticIndex {
  readonly document: BroadsetDocumentV1;
  readonly elements: ReadonlyMap<Id, Element>;
  readonly components: ReadonlyMap<Id, ComponentSemanticIndex>;
  readonly sequences: ReadonlyMap<Id, Sequence>;
}

export interface SemanticIndexes {
  readonly project: BroadsetProjectV1;
  readonly assets: ReadonlyMap<Id, BroadsetProjectV1['resources']['assets'][number]>;
  readonly fonts: ReadonlyMap<Id, BroadsetProjectV1['resources']['fonts'][number]>;
  readonly swatches: ReadonlyMap<Id, BroadsetProjectV1['resources']['swatches'][number]>;
  readonly variables: ReadonlyMap<Id, BroadsetProjectV1['resources']['variables'][number]>;
  readonly styles: ReadonlyMap<Id, BroadsetProjectV1['resources']['styles'][number]>;
  readonly outputProfiles: ReadonlyMap<Id, BroadsetProjectV1['resources']['outputProfiles'][number]>;
  readonly documents: ReadonlyMap<Id, DocumentSemanticIndex>;
  readonly documentList: readonly DocumentSemanticIndex[];
}

function indexById<T extends { readonly id: Id }>(items: readonly T[]): ReadonlyMap<Id, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function createComponentIndex(component: ComponentDefinition): ComponentSemanticIndex {
  return {
    component,
    elements: indexById(component.elements),
    sequences: indexById(component.sequences),
  };
}

function createDocumentIndex(document: BroadsetDocumentV1): DocumentSemanticIndex {
  const components = document.components.map((component) => [component.id, createComponentIndex(component)] as const);

  return {
    document,
    elements: indexById(document.elements),
    components: new Map(components),
    sequences: indexById(document.sequences),
  };
}

export function createSemanticIndexes(project: BroadsetProjectV1): SemanticIndexes {
  const documentList = project.documents.map(createDocumentIndex);

  return {
    project,
    assets: indexById(project.resources.assets),
    fonts: indexById(project.resources.fonts),
    swatches: indexById(project.resources.swatches),
    variables: indexById(project.resources.variables),
    styles: indexById(project.resources.styles),
    outputProfiles: indexById(project.resources.outputProfiles),
    documents: new Map(documentList.map((documentIndex) => [documentIndex.document.id, documentIndex])),
    documentList,
  };
}
