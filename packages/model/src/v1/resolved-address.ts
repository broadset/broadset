import type { Effect, FillLayer, GradientStop, StrokeLayer } from './appearance';
import type { GuideDefinition } from './document';
import type { Element } from './element';
import type { EntityAddress, Id } from './identity';
import type { PageDefinition, PageRootInstance } from './page';
import type { ComponentSemanticIndex, DocumentSemanticIndex, SemanticIndexes } from './semantic-index';
import type { TextParagraph, TextRun } from './text';

export type AddressScope =
  | { readonly kind: 'document'; readonly document: DocumentSemanticIndex }
  | {
      readonly kind: 'component';
      readonly document: DocumentSemanticIndex;
      readonly component: ComponentSemanticIndex;
    }
  | {
      readonly kind: 'page-instance';
      readonly document: DocumentSemanticIndex;
      readonly page: PageDefinition;
      readonly root: PageRootInstance;
    };

export type ResolvedTargetEntity =
  | { readonly kind: 'element'; readonly value: Element; readonly ownerElementId: Id }
  | { readonly kind: 'page-root'; readonly value: PageRootInstance; readonly ownerElementId: Id }
  | { readonly kind: 'text-run'; readonly value: TextRun; readonly ownerElementId: Id }
  | { readonly kind: 'paragraph'; readonly value: TextParagraph; readonly ownerElementId: Id }
  | { readonly kind: 'fill'; readonly value: FillLayer; readonly ownerElementId: Id }
  | { readonly kind: 'stroke'; readonly value: StrokeLayer; readonly ownerElementId: Id }
  | { readonly kind: 'effect'; readonly value: Effect; readonly ownerElementId: Id }
  | { readonly kind: 'gradient-stop'; readonly value: GradientStop; readonly ownerElementId: Id }
  | { readonly kind: 'path-point'; readonly value: { readonly id: Id }; readonly ownerElementId: Id }
  | { readonly kind: 'guide'; readonly value: GuideDefinition };

interface ElementScope {
  readonly elements: ReadonlyMap<Id, Element>;
}

function isDescendant(elements: ReadonlyMap<Id, Element>, elementId: Id, rootId: Id): boolean {
  let current = elements.get(elementId);
  const seen = new Set<Id>();

  while (current !== undefined && !seen.has(current.id)) {
    if (current.id === rootId) return true;
    seen.add(current.id);
    current = current.parentId === null ? undefined : elements.get(current.parentId);
  }

  return false;
}

function descendComponentPath(
  document: DocumentSemanticIndex,
  initial: ReadonlyMap<Id, Element>,
  path: readonly Id[],
): ReadonlyMap<Id, Element> | undefined {
  let elements = initial;

  for (const instanceId of path) {
    const instance = elements.get(instanceId);

    if (instance?.kind !== 'component-instance') return undefined;

    const component = document.components.get(instance.componentId);

    if (component === undefined) return undefined;
    elements = component.elements;
  }

  return elements;
}

function resolveDocumentElementScope(scope: Extract<AddressScope, { readonly kind: 'document' }>, address: EntityAddress): ElementScope | undefined {
  if ((address.instancePath?.length ?? 0) !== 0) return undefined;

  return { elements: scope.document.elements };
}

function resolveComponentElementScope(scope: Extract<AddressScope, { readonly kind: 'component' }>, address: EntityAddress): ElementScope | undefined {
  const elements = descendComponentPath(scope.document, scope.component.elements, address.instancePath ?? []);

  if (elements === undefined) return undefined;

  return { elements };
}

function resolvePageElementScope(scope: Extract<AddressScope, { readonly kind: 'page-instance' }>, address: EntityAddress): ElementScope | undefined {
  const path = address.instancePath;

  if (path?.[0] !== scope.root.id) return undefined;

  const rootElement = scope.document.elements.get(scope.root.elementId);

  if (rootElement === undefined) return undefined;

  if (rootElement.kind !== 'component-instance') {
    if (path.length !== 1) return undefined;

    const elements = new Map(
      [...scope.document.elements].filter(([elementId]) => isDescendant(scope.document.elements, elementId, rootElement.id)),
    );

    return { elements };
  }

  const component = scope.document.components.get(rootElement.componentId);

  if (component === undefined) return undefined;

  const elements = descendComponentPath(scope.document, component.elements, path.slice(1));

  if (elements === undefined) return undefined;

  return { elements };
}

function resolveElementScope(scope: AddressScope, address: EntityAddress): ElementScope | undefined {
  if (address.projectId !== scope.document.projectId || address.documentId !== scope.document.document.id) return undefined;

  switch (scope.kind) {
    case 'document':
      return resolveDocumentElementScope(scope, address);
    case 'component':
      return resolveComponentElementScope(scope, address);
    case 'page-instance':
      return resolvePageElementScope(scope, address);
  }
}

function collectTextEntities(
  elements: ReadonlyMap<Id, Element>,
  kind: 'paragraph' | 'text-run',
  id: Id,
): readonly ResolvedTargetEntity[] {
  const results: ResolvedTargetEntity[] = [];

  elements.forEach((element) => {
    if (element.kind !== 'text') return;
    element.text.paragraphs.forEach((paragraph) => {
      if (kind === 'paragraph' && paragraph.id === id) {
        results.push({ kind, value: paragraph, ownerElementId: element.id });
      }

      paragraph.runs.forEach((run) => {
        if (kind === 'text-run' && run.id === id) results.push({ kind, value: run, ownerElementId: element.id });
      });
    });
  });

  return results;
}

function collectAppearanceEntities(
  elements: ReadonlyMap<Id, Element>,
  kind: 'effect' | 'fill' | 'gradient-stop' | 'stroke',
  id: Id,
): readonly ResolvedTargetEntity[] {
  const results: ResolvedTargetEntity[] = [];

  elements.forEach((element) => {
    const fill = element.appearance.fills.find((candidate) => candidate.id === id);
    const stroke = element.appearance.strokes.find((candidate) => candidate.id === id);
    const effect = element.appearance.effects.find((candidate) => candidate.id === id);

    if (kind === 'fill' && fill !== undefined) results.push({ kind, value: fill, ownerElementId: element.id });
    if (kind === 'stroke' && stroke !== undefined) results.push({ kind, value: stroke, ownerElementId: element.id });
    if (kind === 'effect' && effect !== undefined) results.push({ kind, value: effect, ownerElementId: element.id });

    if (kind === 'gradient-stop') {
      [...element.appearance.fills, ...element.appearance.strokes].forEach((layer) => {
        if (layer.paint.kind !== 'gradient') return;

        const stop = layer.paint.gradient.stops.find((candidate) => candidate.id === id);

        if (stop !== undefined) results.push({ kind, value: stop, ownerElementId: element.id });
      });
    }
  });

  return results;
}

function collectPathPoints(elements: ReadonlyMap<Id, Element>, id: Id): readonly ResolvedTargetEntity[] {
  const results: ResolvedTargetEntity[] = [];

  elements.forEach((element) => {
    if (element.kind !== 'vector' || element.geometryData.kind !== 'path') return;

    const point = element.geometryData.path.points.find((candidate) => candidate.id === id);

    if (point !== undefined) results.push({ kind: 'path-point', value: point, ownerElementId: element.id });
  });

  return results;
}

function resolveUnique(results: readonly ResolvedTargetEntity[]): ResolvedTargetEntity | undefined {
  return results.length === 1 ? results[0] : undefined;
}

function resolveSpecialTargetEntity(scope: AddressScope, address: EntityAddress): ResolvedTargetEntity | undefined {
  if (address.projectId !== scope.document.projectId || address.documentId !== scope.document.document.id) return undefined;

  if (address.entityKind === 'page-root' && scope.kind === 'page-instance') {
    if (address.entityId !== scope.root.id || (address.instancePath?.length ?? 0) !== 0) return undefined;

    return { kind: 'page-root', value: scope.root, ownerElementId: scope.root.elementId };
  }

  if (address.entityKind === 'guide') {
    if (scope.kind !== 'document' || (address.instancePath?.length ?? 0) !== 0) return undefined;

    const guide = scope.document.document.surface.guides.find((candidate) => candidate.id === address.entityId);

    return guide === undefined ? undefined : { kind: 'guide', value: guide };
  }

  return undefined;
}

function resolveElementScopedEntity(scope: ElementScope, address: EntityAddress): ResolvedTargetEntity | undefined {
  switch (address.entityKind) {
    case 'element': {
      const element = scope.elements.get(address.entityId);

      return element === undefined ? undefined : { kind: 'element', value: element, ownerElementId: element.id };
    }

    case 'paragraph':
    case 'text-run':
      return resolveUnique(collectTextEntities(scope.elements, address.entityKind, address.entityId));
    case 'fill':
    case 'stroke':
    case 'effect':
    case 'gradient-stop':
      return resolveUnique(collectAppearanceEntities(scope.elements, address.entityKind, address.entityId));
    case 'path-point':
      return resolveUnique(collectPathPoints(scope.elements, address.entityId));
    default:
      return undefined;
  }
}

export function resolveTargetEntityAddress(scope: AddressScope, address: EntityAddress): ResolvedTargetEntity | undefined {
  const special = resolveSpecialTargetEntity(scope, address);

  if (special !== undefined) return special;

  const elementScope = resolveElementScope(scope, address);

  if (elementScope === undefined) return undefined;

  return resolveElementScopedEntity(elementScope, address);
}

export function createDocumentAddressScope(document: DocumentSemanticIndex): AddressScope {
  return { kind: 'document', document };
}

export function createComponentAddressScope(
  document: DocumentSemanticIndex,
  component: ComponentSemanticIndex,
): AddressScope {
  return { kind: 'component', document, component };
}

export function createPageAddressScope(
  document: DocumentSemanticIndex,
  page: PageDefinition,
  root: PageRootInstance,
): AddressScope {
  return { kind: 'page-instance', document, page, root };
}

export function resolvePageInstanceElement(
  document: DocumentSemanticIndex,
  page: PageDefinition,
  address: { readonly rootInstanceId: Id; readonly componentInstancePath: readonly Id[]; readonly elementId: Id },
): ResolvedTargetEntity | undefined {
  const root = page.rootInstances.find((candidate) => candidate.id === address.rootInstanceId);

  if (root === undefined) return undefined;

  return resolveTargetEntityAddress(createPageAddressScope(document, page, root), {
    projectId: document.projectId,
    documentId: document.document.id,
    entityKind: 'element',
    entityId: address.elementId,
    instancePath: [root.id, ...address.componentInstancePath],
  });
}

function resolvePagePathEntity(document: DocumentSemanticIndex, address: EntityAddress): boolean {
  const rootId = address.instancePath?.[0];

  for (const page of document.document.pages) {
    const root = page.rootInstances.find((candidate) => candidate.id === rootId);

    if (
      root !== undefined &&
      resolveTargetEntityAddress(createPageAddressScope(document, page, root), address) !== undefined
    ) {
      return true;
    }
  }

  return false;
}

function resolveDocumentOwnedEntity(document: DocumentSemanticIndex, address: EntityAddress): boolean {
  if (resolveTargetEntityAddress(createDocumentAddressScope(document), address) !== undefined) return true;

  switch (address.entityKind) {
    case 'component':
      return document.components.has(address.entityId);
    case 'sequence':
      return document.sequences.has(address.entityId);
    case 'page':
      return document.document.pages.some((page) => page.id === address.entityId);
    case 'state-machine':
      return document.document.stateMachines.some((machine) => machine.id === address.entityId);
    case 'view-model':
      return document.document.viewModels.some((viewModel) => viewModel.id === address.entityId);
    case 'binding':
      return document.document.bindings.some((binding) => binding.id === address.entityId);
    default:
      return false;
  }
}

export function resolveProjectEntityAddress(indexes: SemanticIndexes, address: EntityAddress): boolean {
  if (address.projectId !== indexes.project.id) return false;
  if (address.entityKind === 'project') return address.entityId === indexes.project.id && address.documentId === undefined;
  if (address.documentId === undefined) return false;

  const document = indexes.documents.get(address.documentId);

  if (document === undefined) return false;
  if (address.entityKind === 'document') return address.entityId === document.document.id && (address.instancePath?.length ?? 0) === 0;

  return (address.instancePath?.length ?? 0) > 0
    ? resolvePagePathEntity(document, address)
    : resolveDocumentOwnedEntity(document, address);
}
