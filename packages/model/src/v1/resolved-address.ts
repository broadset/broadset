import type { Effect, FillLayer, GradientStop, StrokeLayer } from './appearance';
import type { GuideDefinition } from './document';
import type { Element } from './element';
import type { EntityAddress, Id } from './identity';
import type { PageDefinition, PageRootInstance } from './page';
import {
  type ComponentSemanticIndex,
  createElementNestedIndexes,
  type DocumentSemanticIndex,
  type ElementNestedIndexes,
  type SemanticIndexes,
} from './semantic-index';
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
      readonly ordinaryRootScope: ElementScope | undefined;
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
  readonly nestedEntities: ElementNestedIndexes;
}

export type PageAddressScope = Extract<AddressScope, { readonly kind: 'page-instance' }>;
type PageAddressScopes = ReadonlyMap<Id, ReadonlyMap<Id, PageAddressScope>>;

type PageInstanceElementAddress = {
  readonly rootInstanceId: Id;
  readonly componentInstancePath: readonly Id[];
  readonly elementId: Id;
};

function createOrdinaryRootScope(elements: ReadonlyMap<Id, Element>, rootId: Id): ElementScope {
  const children = new Map<Id, Element[]>();

  elements.forEach((element) => {
    if (element.parentId === null) return;

    const siblings = children.get(element.parentId) ?? [];

    siblings.push(element);
    children.set(element.parentId, siblings);
  });

  const rootElements = new Map<Id, Element>();
  const pending = [rootId];

  while (pending.length > 0) {
    const elementId = pending.pop();

    if (elementId === undefined || rootElements.has(elementId)) continue;

    const element = elements.get(elementId);

    if (element === undefined) continue;
    rootElements.set(elementId, element);
    children.get(elementId)?.forEach((child) => pending.push(child.id));
  }

  return { elements: rootElements, nestedEntities: createElementNestedIndexes([...rootElements.values()]) };
}

function resolveSelectedRootId({
  elements,
  selectedRootIds,
  owners,
  elementId,
}: {
  readonly elements: ReadonlyMap<Id, Element>;
  readonly selectedRootIds: ReadonlySet<Id>;
  readonly owners: Map<Id, Id | undefined>;
  readonly elementId: Id;
}): Id | undefined {
  const path: Id[] = [];
  const seen = new Set<Id>();
  let currentId: Id | undefined = elementId;
  let owner: Id | undefined;

  while (currentId !== undefined) {
    if (owners.has(currentId)) {
      owner = owners.get(currentId);
      break;
    }

    if (seen.has(currentId)) break;
    seen.add(currentId);
    path.push(currentId);

    if (selectedRootIds.has(currentId)) {
      owner = currentId;
      break;
    }

    const parentId: Id | null | undefined = elements.get(currentId)?.parentId;

    currentId = parentId === null ? undefined : parentId;
  }

  path.forEach((id) => owners.set(id, owner));

  return owner;
}

function createOrdinaryRootScopes(
  elements: ReadonlyMap<Id, Element>,
  selectedRootIds: ReadonlySet<Id>,
): ReadonlyMap<Id, ElementScope> {
  const owners = new Map<Id, Id | undefined>();
  const partitions = new Map<Id, Map<Id, Element>>(
    [...selectedRootIds].map((rootId: Id): readonly [Id, Map<Id, Element>] => [rootId, new Map<Id, Element>()]),
  );

  elements.forEach((element) => {
    const rootId = resolveSelectedRootId({ elements, selectedRootIds, owners, elementId: element.id });

    if (rootId !== undefined) partitions.get(rootId)?.set(element.id, element);
  });

  return new Map(
    [...partitions].map(
      ([rootId, rootElements]: [Id, Map<Id, Element>]): readonly [Id, ElementScope] => [
        rootId,
        { elements: rootElements, nestedEntities: createElementNestedIndexes([...rootElements.values()]) },
      ],
    ),
  );
}

function descendComponentPath(
  document: DocumentSemanticIndex,
  initial: ElementScope,
  path: readonly Id[],
): ElementScope | undefined {
  let scope = initial;

  for (const instanceId of path) {
    const instance = scope.elements.get(instanceId);

    if (instance?.kind !== 'component-instance') return undefined;

    const component = document.components.get(instance.componentId);

    if (component === undefined) return undefined;
    scope = { elements: component.elements, nestedEntities: component.nestedEntities };
  }

  return scope;
}

function resolveDocumentElementScope(scope: Extract<AddressScope, { readonly kind: 'document' }>, address: EntityAddress): ElementScope | undefined {
  if (address.pageId !== undefined) return undefined;
  if ((address.instancePath?.length ?? 0) !== 0) return undefined;

  return { elements: scope.document.elements, nestedEntities: scope.document.nestedEntities };
}

function resolveComponentElementScope(scope: Extract<AddressScope, { readonly kind: 'component' }>, address: EntityAddress): ElementScope | undefined {
  if (address.pageId !== undefined) return undefined;

  const elements = descendComponentPath(
    scope.document,
    { elements: scope.component.elements, nestedEntities: scope.component.nestedEntities },
    address.instancePath ?? [],
  );

  if (elements === undefined) return undefined;

  return elements;
}

function resolveOrdinaryPageRootScope(
  scope: Extract<AddressScope, { readonly kind: 'page-instance' }>,
  address: EntityAddress,
  path: readonly Id[],
): ElementScope | undefined {
  const rootElement = scope.document.elements.get(scope.root.elementId);

  if (rootElement === undefined || rootElement.kind === 'component-instance' || scope.ordinaryRootScope === undefined) return undefined;

  const [firstInstanceId, ...nestedPath] = path.slice(1);

  if (firstInstanceId === undefined) {
    return scope.ordinaryRootScope.elements.has(address.entityId) ? scope.ordinaryRootScope : undefined;
  }

  const firstInstance = scope.ordinaryRootScope.elements.get(firstInstanceId);

  if (firstInstance?.kind !== 'component-instance') return undefined;

  const component = scope.document.components.get(firstInstance.componentId);

  if (component === undefined) return undefined;

  const elements = descendComponentPath(
    scope.document,
    { elements: component.elements, nestedEntities: component.nestedEntities },
    nestedPath,
  );

  return elements;
}

function resolvePageElementScope(scope: Extract<AddressScope, { readonly kind: 'page-instance' }>, address: EntityAddress): ElementScope | undefined {
  if (address.pageId !== scope.page.id) return undefined;

  const path = address.instancePath;

  if (path?.[0] !== scope.root.id) return undefined;

  const rootElement = scope.document.elements.get(scope.root.elementId);

  if (rootElement === undefined) return undefined;
  if (rootElement.kind !== 'component-instance') return resolveOrdinaryPageRootScope(scope, address, path);

  const component = scope.document.components.get(rootElement.componentId);

  if (component === undefined) return undefined;

  const elements = descendComponentPath(
    scope.document,
    { elements: component.elements, nestedEntities: component.nestedEntities },
    path.slice(1),
  );

  if (elements === undefined) return undefined;

  return elements;
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

function resolveSpecialTargetEntity(scope: AddressScope, address: EntityAddress): ResolvedTargetEntity | undefined {
  if (address.projectId !== scope.document.projectId || address.documentId !== scope.document.document.id) return undefined;

  if (address.entityKind === 'page-root' && scope.kind === 'page-instance') {
    if (address.pageId !== scope.page.id) return undefined;
    if (address.entityId !== scope.root.id || (address.instancePath?.length ?? 0) !== 0) return undefined;

    return { kind: 'page-root', value: scope.root, ownerElementId: scope.root.elementId };
  }

  if (address.entityKind === 'guide') {
    if (scope.kind !== 'document' || address.pageId !== undefined || (address.instancePath?.length ?? 0) !== 0) return undefined;

    const guide = scope.document.guides.get(address.entityId);

    return guide === undefined ? undefined : { kind: 'guide', value: guide };
  }

  return undefined;
}

function resolveTextEntity(scope: ElementScope, address: EntityAddress): ResolvedTargetEntity | undefined {
  switch (address.entityKind) {
    case 'paragraph': {
      const entries = scope.nestedEntities.paragraphs.get(address.entityId);
      const entry = entries?.length === 1 ? entries[0] : undefined;

      return entry === undefined ? undefined : { kind: 'paragraph', ...entry };
    }

    case 'text-run': {
      const entries = scope.nestedEntities.textRuns.get(address.entityId);
      const entry = entries?.length === 1 ? entries[0] : undefined;

      return entry === undefined ? undefined : { kind: 'text-run', ...entry };
    }

    default:
      return undefined;
  }
}

function resolvePaintLayerEntity(scope: ElementScope, address: EntityAddress): ResolvedTargetEntity | undefined {
  switch (address.entityKind) {

    case 'fill': {
      const entries = scope.nestedEntities.fills.get(address.entityId);
      const entry = entries?.length === 1 ? entries[0] : undefined;

      return entry === undefined ? undefined : { kind: 'fill', ...entry };
    }

    case 'stroke': {
      const entries = scope.nestedEntities.strokes.get(address.entityId);
      const entry = entries?.length === 1 ? entries[0] : undefined;

      return entry === undefined ? undefined : { kind: 'stroke', ...entry };
    }

    default:
      return undefined;
  }
}

function resolveAppearanceEntity(scope: ElementScope, address: EntityAddress): ResolvedTargetEntity | undefined {
  switch (address.entityKind) {
    case 'effect': {
      const entries = scope.nestedEntities.effects.get(address.entityId);
      const entry = entries?.length === 1 ? entries[0] : undefined;

      return entry === undefined ? undefined : { kind: 'effect', ...entry };
    }

    case 'gradient-stop': {
      const entries = scope.nestedEntities.gradientStops.get(address.entityId);
      const entry = entries?.length === 1 ? entries[0] : undefined;

      return entry === undefined ? undefined : { kind: 'gradient-stop', ...entry };
    }

    default:
      return undefined;
  }
}

function resolveElementScopedEntity(scope: ElementScope, address: EntityAddress): ResolvedTargetEntity | undefined {
  if (address.entityKind === 'element') {
    const element = scope.elements.get(address.entityId);

    return element === undefined ? undefined : { kind: 'element', value: element, ownerElementId: element.id };
  }

  const textEntity = resolveTextEntity(scope, address);

  if (textEntity !== undefined) return textEntity;

  const appearanceEntity = resolvePaintLayerEntity(scope, address) ?? resolveAppearanceEntity(scope, address);

  if (appearanceEntity !== undefined) return appearanceEntity;

  if (address.entityKind !== 'path-point') return undefined;

  const entries = scope.nestedEntities.pathPoints.get(address.entityId);
  const entry = entries?.length === 1 ? entries[0] : undefined;

  return entry === undefined ? undefined : { kind: 'path-point', ...entry };
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
  const rootElement = document.elements.get(root.elementId);
  const ordinaryRootScope = rootElement === undefined || rootElement.kind === 'component-instance'
    ? undefined
    : createOrdinaryRootScope(document.elements, rootElement.id);

  return { kind: 'page-instance', document, page, root, ordinaryRootScope };
}

export function createPageAddressScopes(document: DocumentSemanticIndex): PageAddressScopes {
  const selectedOrdinaryRootIds = new Set<Id>();

  document.document.pages.forEach((page) => {
    page.rootInstances.forEach((root) => {
      const rootElement = document.elements.get(root.elementId);

      if (rootElement !== undefined && rootElement.kind !== 'component-instance') selectedOrdinaryRootIds.add(rootElement.id);
    });
  });

  const ordinaryScopes = createOrdinaryRootScopes(document.elements, selectedOrdinaryRootIds);

  return new Map(document.document.pages.map((page) => [
    page.id,
    new Map(page.rootInstances.map((root) => [
      root.id,
      {
        kind: 'page-instance' as const,
        document,
        page,
        root,
        ordinaryRootScope: ordinaryScopes.get(root.elementId),
      },
    ])),
  ]));
}

export function resolvePageInstanceElementInScope(
  scope: PageAddressScope,
  address: PageInstanceElementAddress,
): ResolvedTargetEntity | undefined {
  if (address.rootInstanceId !== scope.root.id) return undefined;

  return resolveTargetEntityAddress(scope, {
    projectId: scope.document.projectId,
    documentId: scope.document.document.id,
    pageId: scope.page.id,
    entityKind: 'element',
    entityId: address.elementId,
    instancePath: [scope.root.id, ...address.componentInstancePath],
  });
}

export function resolvePageInstanceElement(
  document: DocumentSemanticIndex,
  page: PageDefinition,
  address: { readonly rootInstanceId: Id; readonly componentInstancePath: readonly Id[]; readonly elementId: Id },
): ResolvedTargetEntity | undefined {
  const root = document.pageRoots.get(page.id)?.get(address.rootInstanceId);

  if (root === undefined) return undefined;

  const scope = createPageAddressScope(document, page, root);

  if (scope.kind !== 'page-instance') return undefined;

  return resolvePageInstanceElementInScope(scope, address);
}

function resolvePagePathEntity(document: DocumentSemanticIndex, address: EntityAddress): boolean {
  const rootId = address.instancePath?.[0];
  const page = address.pageId === undefined ? undefined : document.pages.get(address.pageId);

  if (page === undefined) return false;

  const root = rootId === undefined ? undefined : document.pageRoots.get(page.id)?.get(rootId);

  return root !== undefined && resolveTargetEntityAddress(createPageAddressScope(document, page, root), address) !== undefined;
}

function resolveDocumentOwnedEntity(document: DocumentSemanticIndex, address: EntityAddress): boolean {
  if (resolveTargetEntityAddress(createDocumentAddressScope(document), address) !== undefined) return true;
  if (address.pageId !== undefined || (address.instancePath?.length ?? 0) !== 0) return false;

  switch (address.entityKind) {
    case 'component':
      return document.components.has(address.entityId);
    case 'sequence':
      return document.sequences.has(address.entityId);
    case 'page':
      return document.pages.has(address.entityId);
    case 'state-machine':
      return document.stateMachines.has(address.entityId);
    case 'view-model':
      return document.viewModels.has(address.entityId);
    case 'binding':
      return document.bindings.has(address.entityId);
    default:
      return false;
  }
}

function resolveProjectOwnedEntity(indexes: SemanticIndexes, address: EntityAddress): boolean {
  if (
    address.documentId !== undefined ||
    address.pageId !== undefined ||
    (address.instancePath?.length ?? 0) !== 0
  ) {
    return false;
  }

  switch (address.entityKind) {
    case 'asset':
      return indexes.assets.has(address.entityId);
    case 'font-family':
      return indexes.fonts.has(address.entityId);
    case 'swatch':
      return indexes.swatches.has(address.entityId);
    case 'variable-collection':
      return indexes.variables.has(address.entityId);
    case 'shared-style':
      return indexes.styles.has(address.entityId);
    case 'output-profile':
      return indexes.outputProfiles.has(address.entityId);
    case 'template-group':
      return indexes.templateGroups.has(address.entityId);
    case 'interop-source':
      return indexes.interopSources.has(address.entityId);
    case 'interop-record':
      return indexes.interopRecords.has(address.entityId);
    default:
      return false;
  }
}

function resolvePageOwnedEntity(document: DocumentSemanticIndex, address: EntityAddress): boolean {
  const page = address.pageId === undefined ? undefined : document.pages.get(address.pageId);

  if (page === undefined) return false;

  if (address.entityKind !== 'page-root') return false;

  const root = document.pageRoots.get(page.id)?.get(address.entityId);

  return root !== undefined && resolveTargetEntityAddress(createPageAddressScope(document, page, root), address) !== undefined;
}

export function resolveProjectEntityAddress(indexes: SemanticIndexes, address: EntityAddress): boolean {
  if (address.projectId !== indexes.project.id) return false;

  if (address.entityKind === 'project') {
    return (
      address.entityId === indexes.project.id &&
      address.documentId === undefined &&
      address.pageId === undefined &&
      (address.instancePath?.length ?? 0) === 0
    );
  }

  if (address.documentId === undefined) return resolveProjectOwnedEntity(indexes, address);

  const document = indexes.documents.get(address.documentId);

  if (document === undefined) return false;

  if (address.entityKind === 'document') {
    return (
      address.entityId === document.document.id &&
      address.pageId === undefined &&
      (address.instancePath?.length ?? 0) === 0
    );
  }

  if ((address.instancePath?.length ?? 0) > 0) return resolvePagePathEntity(document, address);
  if (address.pageId !== undefined) return resolvePageOwnedEntity(document, address);

  return resolveDocumentOwnedEntity(document, address);
}
