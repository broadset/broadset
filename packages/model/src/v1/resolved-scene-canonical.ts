import type { ComponentDefinition } from './component';
import type { Diagnostic } from './diagnostics';
import type { BroadsetDocumentV1 } from './document';
import type { ComponentInstanceElement, Element, ElementTransform } from './element';
import type { Id, PropertyTarget } from './identity';
import { parseProjectV1Unknown } from './load';
import type { InstanceAddress, PageDefinition, PageRootInstance, TypedOverride } from './page';
import { resolveWorldGeometryV1 } from './resolved-geometry';
import { applyResolvedOverrideV1, readResolvedPropertyValueV1 } from './resolved-overrides';
import { appendNodeResourceFallbacks, appendSceneContextResourceFallbacks } from './resolved-scene-resources';
import type {
  ResolveCanonicalSceneOptionsV1,
  ResolvedCanonicalSceneResultV1,
  ResolvedPropertyContributionV1,
  ResolvedSceneFallbackV1,
  ResolvedSceneNodeV1,
  ResolvedScenePropertyV1,
  SceneProvenanceSourceV1,
} from './resolved-scene-types';
import { applyResolvedTransformValueV1 } from './resolved-transform-overrides';
import type { Asset } from './resources';
import type { TypedValue } from './typed-value';

interface PendingLayer {
  readonly componentPath: readonly Id[];
  readonly ownerElementId?: Id | undefined;
  readonly target: PropertyTarget;
  readonly value: TypedValue;
  readonly source: SceneProvenanceSourceV1;
}

interface WalkContext {
  readonly projectId: Id;
  readonly document: BroadsetDocumentV1;
  readonly page: PageDefinition;
  readonly root: PageRootInstance;
  readonly components: ReadonlyMap<Id, ComponentDefinition>;
  readonly assets: ReadonlyMap<Id, Asset>;
  readonly pageLayers: readonly PendingLayer[];
  readonly nodes: ResolvedSceneNodeV1[];
  readonly diagnostics: Diagnostic[];
  readonly fallbacks: ResolvedSceneFallbackV1[];
  readonly visible: boolean;
  readonly rootTransform?: ElementTransform | undefined;
  readonly rootProperties: readonly ResolvedScenePropertyV1[];
}

interface WalkOptions {
  readonly context: WalkContext;
  readonly scope: readonly Element[];
  readonly elementId: Id;
  readonly componentPath: readonly Id[];
  readonly parentAddress: InstanceAddress | null;
  readonly parentTransform?: ElementTransform | undefined;
  readonly depth: number;
  readonly isPageRoot: boolean;
  readonly sourceComponentId?: Id | undefined;
  readonly componentLayers: readonly PendingLayer[];
  readonly activeComponentIds: ReadonlySet<Id>;
  readonly visitedElementIds: ReadonlySet<Id>;
}

function samePath(left: readonly Id[], right: readonly Id[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function ownedFrozen<T>(value: T): T {
  const owned = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (typeof candidate !== 'object' || candidate === null || Object.isFrozen(candidate)) return;
    Reflect.ownKeys(candidate).forEach((key) => {
      freeze(Reflect.get(candidate, key));
    });
    Object.freeze(candidate);
  };

  freeze(owned);

  return owned;
}

function invalid(diagnostics: readonly Diagnostic[]): ResolvedCanonicalSceneResultV1 {
  return ownedFrozen({ status: 'invalid', diagnostics });
}

function createError(code: string, message: string): Diagnostic {
  return { code, severity: 'error', message };
}

interface LocalizeTargetOptions {
  readonly target: PropertyTarget;
  readonly projectId: Id;
  readonly documentId: Id;
  readonly pageId: Id;
  readonly rootId: Id;
  readonly componentPath: readonly Id[];
}

function localizeTarget({
  target,
  projectId,
  documentId,
  pageId,
  rootId,
  componentPath,
}: LocalizeTargetOptions): PropertyTarget {
  return {
    pointer: target.pointer,
    entity: {
      projectId,
      documentId,
      pageId,
      entityKind: target.entity.entityKind,
      entityId: target.entity.entityId,
      instancePath: [rootId, ...componentPath],
    },
  };
}

function pageTargetPath(target: PropertyTarget, rootId: Id): readonly Id[] | undefined {
  const path = target.entity.instancePath;

  if (path?.[0] !== rootId) return undefined;

  return path.slice(1);
}

function createPageLayers(page: PageDefinition, root: PageRootInstance): readonly PendingLayer[] {
  const layers: PendingLayer[] = [];
  let overrideIndex = root.overrides.length;
  const append = (override: TypedOverride, componentPath: readonly Id[], ownerElementId?: Id): void => {
    layers.push({
      componentPath,
      ownerElementId,
      target: override.target,
      value: override.value,
      source: {
        kind: 'page-override',
        pageId: page.id,
        address: {
          rootInstanceId: root.id,
          componentInstancePath: componentPath,
          elementId: ownerElementId ?? override.target.entity.entityId,
        },
        overrideIndex,
      },
    });
    overrideIndex += 1;
  };

  root.overrides.forEach((override, index) => {
    const componentPath = pageTargetPath(override.target, root.id);

    if (componentPath !== undefined && override.target.entity.entityKind !== 'page-root') {
      overrideIndex = index;
      append(override, componentPath);
    }
  });
  overrideIndex = root.overrides.length;
  page.descendantOverrides.forEach((descendant) => {
    if (descendant.address.rootInstanceId !== root.id) return;
    descendant.overrides.forEach((override) => {
      append(override, descendant.address.componentInstancePath, descendant.address.elementId);
    });
  });

  return layers;
}

function propertyKey(target: PropertyTarget): string {
  return `${target.entity.entityKind}\u0000${target.entity.entityId}\u0000${target.pointer}`;
}

function layerAppliesToAddress(layer: PendingLayer, address: InstanceAddress): boolean {
  if (!samePath(layer.componentPath, address.componentInstancePath)) return false;

  return layer.ownerElementId === undefined || layer.ownerElementId === address.elementId;
}

function applyLayers(options: {
  readonly element: Element;
  readonly address: InstanceAddress;
  readonly componentId?: Id | undefined;
  readonly layers: readonly PendingLayer[];
  readonly context: WalkContext;
}): { readonly element: Element; readonly properties: readonly ResolvedScenePropertyV1[] } | undefined {
  let resolved = structuredClone(options.element);
  const properties = new Map<
    string,
    { target: PropertyTarget; contributions: ResolvedPropertyContributionV1[]; value: TypedValue }
  >();

  for (const layer of options.layers) {
    if (!layerAppliesToAddress(layer, options.address)) continue;

    const localized = localizeTarget({
      target: layer.target,
      projectId: options.context.projectId,
      documentId: options.context.document.id,
      pageId: options.context.page.id,
      rootId: options.address.rootInstanceId,
      componentPath: options.address.componentInstancePath,
    });
    const applied = applyResolvedOverrideV1(resolved, localized, layer.value);

    if (applied === undefined) continue;

    const key = propertyKey(localized);
    let property = properties.get(key);

    if (property === undefined) {
      const definitionValue = readResolvedPropertyValueV1(options.element, localized);

      if (definitionValue === undefined) {
        options.context.diagnostics.push(
          createError('scene.unreadable-property', `Could not read resolved target ${localized.pointer}`),
        );

        return undefined;
      }

      property = {
        target: localized,
        contributions: [
          {
            value: definitionValue,
            source:
              options.componentId === undefined ?
                { kind: 'definition', documentId: options.context.document.id }
              : { kind: 'definition', documentId: options.context.document.id, componentId: options.componentId },
          },
        ],
        value: definitionValue,
      };
      properties.set(key, property);
    }

    property.contributions.push({ value: layer.value, source: layer.source });
    property.value = layer.value;
    resolved = applied;
  }

  return { element: resolved, properties: [...properties.values()] };
}

interface BuildComponentLayersOptions {
  readonly context: WalkContext;
  readonly component: ComponentDefinition;
  readonly instance: ComponentInstanceElement;
  readonly instanceAddress: InstanceAddress;
  readonly childPath: readonly Id[];
  readonly isPageRoot: boolean;
}

function buildComponentLayers({
  context,
  component,
  instance,
  instanceAddress,
  childPath,
  isPageRoot,
}: BuildComponentLayersOptions): readonly PendingLayer[] {
  const values = new Map(component.exposedProperties.map((property) => [property.id, property.defaultValue]));

  instance.propertyValues.forEach((entry) => values.set(entry.exposedPropertyId, entry.value));
  if (isPageRoot)
    context.root.componentPropertyValues.forEach((entry) => values.set(entry.exposedPropertyId, entry.value));

  return component.exposedProperties.flatMap((property) => {
    const value = values.get(property.id);

    if (value === undefined) return [];

    return property.bindings.map(
      (binding): PendingLayer => ({
        componentPath: [...childPath, ...(binding.target.entity.instancePath ?? [])],
        target: binding.target,
        value,
        source: {
          kind: 'component-property',
          componentId: component.id,
          instanceAddress,
          exposedPropertyId: property.id,
          bindingId: binding.id,
        },
      }),
    );
  });
}

function childrenOf(scope: readonly Element[], parentId: Id): readonly Element[] {
  return scope.filter((element) => element.parentId === parentId);
}

function walkElement(options: WalkOptions): void {
  if (options.visitedElementIds.has(options.elementId)) return;

  const source = options.scope.find((element) => element.id === options.elementId);

  if (source === undefined) return;

  const address: InstanceAddress = {
    rootInstanceId: options.context.root.id,
    componentInstancePath: options.componentPath,
    elementId: source.id,
  };
  const layered = applyLayers({
    element: source,
    address,
    componentId: options.sourceComponentId,
    layers: [...options.componentLayers, ...options.context.pageLayers],
    context: options.context,
  });

  if (layered === undefined) return;

  const localGeometry =
    options.isPageRoot && options.context.rootTransform !== undefined ?
      { ...layered.element.geometry, transform: options.context.rootTransform }
    : layered.element.geometry;
  const worldGeometry = resolveWorldGeometryV1(localGeometry, options.parentTransform);
  const rootProperties = options.isPageRoot ? createPageRootProperties(options.context) : [];
  const fallbacks = appendNodeResourceFallbacks({
    assets: options.context.assets,
    diagnostics: options.context.diagnostics,
    fallbacks: options.context.fallbacks,
    address,
    element: layered.element,
  });
  const node: ResolvedSceneNodeV1 = {
    address,
    parentAddress: options.parentAddress,
    sourceElement: structuredClone(source),
    element: { ...layered.element, geometry: localGeometry },
    localGeometry,
    worldGeometry,
    visible: options.context.visible,
    depth: options.depth,
    properties: [...rootProperties, ...layered.properties],
    fallbacks,
  };

  options.context.nodes.push(node);

  const visited = new Set([...options.visitedElementIds, source.id]);

  if (source.kind === 'component-instance') {
    const component = options.context.components.get(source.componentId);
    const childPath = options.isPageRoot ? options.componentPath : [...options.componentPath, source.id];

    if (component !== undefined && !options.activeComponentIds.has(component.id)) {
      const componentLayers = [
        ...options.componentLayers,
        ...buildComponentLayers({
          context: options.context,
          component,
          instance: source,
          instanceAddress: address,
          childPath,
          isPageRoot: options.isPageRoot,
        }),
      ];
      const activeComponentIds = new Set([...options.activeComponentIds, component.id]);

      component.rootElementIds.forEach((rootElementId) => {
        walkElement({
          ...options,
          scope: component.elements,
          elementId: rootElementId,
          componentPath: childPath,
          parentAddress: address,
          parentTransform: worldGeometry.transform,
          depth: options.depth + 1,
          isPageRoot: false,
          sourceComponentId: component.id,
          componentLayers,
          activeComponentIds,
          visitedElementIds: new Set<Id>(),
        });
      });
    }

    if (options.isPageRoot) return;
  }

  childrenOf(options.scope, source.id).forEach((child) => {
    walkElement({
      ...options,
      elementId: child.id,
      parentAddress: address,
      parentTransform: worldGeometry.transform,
      depth: options.depth + 1,
      isPageRoot: false,
      visitedElementIds: visited,
    });
  });
}

function typedMatrixValue(transform: ElementTransform, index: number, value: number): TypedValue {
  if (transform.kind === 'affine2d') {
    return index <= 3 ? { type: 'number', value } : { type: 'length', value };
  }

  return index <= 11 || index === 15 ? { type: 'number', value } : { type: 'length', value };
}

function createPageRootTarget(
  options: ResolveCanonicalSceneOptionsV1,
  root: PageRootInstance,
  pointer: string,
): PropertyTarget {
  return {
    entity: {
      projectId: options.project.id,
      documentId: options.documentId,
      pageId: options.pageId,
      entityKind: 'page-root',
      entityId: root.id,
    },
    pointer,
  };
}

function resolveRootPlacement(
  options: ResolveCanonicalSceneOptionsV1,
  root: PageRootInstance,
): {
  readonly visible: boolean;
  readonly transform?: ElementTransform | undefined;
  readonly properties: readonly ResolvedScenePropertyV1[];
} {
  const pageRootSource: SceneProvenanceSourceV1 = {
    kind: 'page-root',
    pageId: options.pageId,
    rootInstanceId: root.id,
  };
  let visible = root.visible ?? true;
  let transform = root.transform;
  const visibleValue: TypedValue = { type: 'boolean', value: visible };
  const properties: ResolvedScenePropertyV1[] = [
    {
      target: createPageRootTarget(options, root, '/visible'),
      contributions: [{ value: visibleValue, source: pageRootSource }],
      value: visibleValue,
    },
  ];

  const initialTransform = transform;

  initialTransform?.matrix.forEach((coefficient, index) => {
    const value = typedMatrixValue(initialTransform, index, coefficient);

    properties.push({
      target: createPageRootTarget(options, root, `/transform/matrix/${String(index)}`),
      contributions: [{ value, source: pageRootSource }],
      value,
    });
  });
  root.overrides.forEach((override, overrideIndex) => {
    if (override.target.entity.entityKind !== 'page-root' || override.target.entity.entityId !== root.id) return;

    const source: SceneProvenanceSourceV1 = {
      kind: 'page-override',
      pageId: options.pageId,
      address: { rootInstanceId: root.id, componentInstancePath: [], elementId: root.elementId },
      overrideIndex,
    };

    if (override.target.pointer === '/visible' && override.value.type === 'boolean') visible = override.value.value;
    else if (transform !== undefined) {
      transform =
        applyResolvedTransformValueV1(
          transform,
          override.target.pointer.replace('/transform/', '/geometry/transform/'),
          override.value,
        ) ?? transform;
    }

    const property = properties.find((candidate) => candidate.target.pointer === override.target.pointer);

    if (property !== undefined) {
      const contributions = [...property.contributions, { value: override.value, source }];
      const index = properties.indexOf(property);

      properties[index] = { ...property, contributions, value: override.value };
    }
  });

  return { visible, transform, properties };
}

function createPageRootProperties(context: WalkContext): readonly ResolvedScenePropertyV1[] {
  // Root placement resolution owns this provenance so every descendant observes one effective state.
  return context.rootProperties;
}

export function resolveCanonicalSceneV1(options: ResolveCanonicalSceneOptionsV1): ResolvedCanonicalSceneResultV1 {
  const parsed = parseProjectV1Unknown(options.project);

  if (parsed.status !== 'loaded') return invalid(parsed.diagnostics);

  const document = parsed.project.documents.find((candidate) => candidate.id === options.documentId);

  if (document === undefined)
    return invalid([createError('scene.missing-document', `Document ${options.documentId} does not exist`)]);

  const page = document.pages.find((candidate) => candidate.id === options.pageId);

  if (page === undefined) return invalid([createError('scene.missing-page', `Page ${options.pageId} does not exist`)]);

  const components = new Map(document.components.map((component) => [component.id, component]));
  const assets = new Map(parsed.project.resources.assets.map((asset) => [asset.id, asset]));
  const nodes: ResolvedSceneNodeV1[] = [];
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  const fallbacks: ResolvedSceneFallbackV1[] = [];

  appendSceneContextResourceFallbacks({ document, assets, diagnostics, fallbacks });

  page.rootInstances.forEach((root) => {
    const placement = resolveRootPlacement(options, root);
    const context: WalkContext = {
      projectId: parsed.project.id,
      document,
      page,
      root,
      components,
      assets,
      pageLayers: createPageLayers(page, root),
      nodes,
      diagnostics,
      fallbacks,
      visible: placement.visible,
      rootTransform: placement.transform,
      rootProperties: placement.properties,
    };

    walkElement({
      context,
      scope: document.elements,
      elementId: root.elementId,
      componentPath: [],
      parentAddress: null,
      depth: 0,
      isPageRoot: true,
      componentLayers: [],
      activeComponentIds: new Set<Id>(),
      visitedElementIds: new Set<Id>(),
    });
  });

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return invalid(diagnostics);

  const selectedVariableModes: Readonly<Record<Id, Id>> = {
    ...document.selectedVariableModes,
    ...page.selectedVariableModes,
  };
  const scene = {
    projectId: parsed.project.id,
    documentId: document.id,
    pageId: page.id,
    surface: document.surface,
    color: document.color,
    nodes,
    resources: parsed.project.resources,
    data: { selectedVariableModes, selectedSampleDataSets: page.selectedSampleDataSets, values: [] },
    fallbacks,
    diagnostics,
  };

  return ownedFrozen({ status: 'resolved', scene });
}
