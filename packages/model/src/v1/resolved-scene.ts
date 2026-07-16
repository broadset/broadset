import type { ComponentInstanceElement, Element } from './element';
import type { Id } from './identity';
import type { BroadsetProjectV1 } from './project';
import { type ComponentSemanticIndex, createSemanticIndexes, type DocumentSemanticIndex } from './semantic-index';

/**
 * A single placed element in a page's resolved instance tree. The address mirrors the v1
 * {@link import('./page').InstanceAddress} contract exactly, so it round-trips through
 * {@link import('./resolved-address').resolvePageInstanceElement}: a page root instance id, the chain of
 * component-instance element ids crossed AFTER the page root to reach this element (the page root
 * element's own id is represented by `rootInstanceId`, never in this path), and the element id.
 *
 * This is a TOPOLOGY resolution — which elements a page places, their nesting, and their visibility.
 * Per-instance typed-override VALUE application (page `rootInstances[].overrides` /
 * `descendantOverrides` and component property values) is a separable concern layered on top of this
 * tree by joining on the address; it is not applied here.
 */
export interface ResolvedSceneInstance {
  readonly rootInstanceId: Id;
  readonly componentInstancePath: readonly Id[];
  readonly element: Element;
  /** Parent element id within the resolved tree, or null for a page root or a component's root element. */
  readonly parentElementId: Id | null;
  /** The owning page root instance's visibility (defaults to visible). */
  readonly visible: boolean;
  /** Nesting depth from the page root instance (0 = the page root element). */
  readonly depth: number;
}

function buildChildrenByParent(elements: readonly Element[]): ReadonlyMap<Id, readonly Element[]> {
  const children = new Map<Id, Element[]>();

  for (const element of elements) {
    if (element.parentId === null) continue;

    const siblings = children.get(element.parentId) ?? [];

    siblings.push(element);
    children.set(element.parentId, siblings);
  }

  return children;
}

function isComponentInstance(element: Element): element is ComponentInstanceElement {
  return element.kind === 'component-instance';
}

interface WalkContext {
  readonly document: DocumentSemanticIndex;
  readonly rootInstanceId: Id;
  readonly visible: boolean;
  readonly out: ResolvedSceneInstance[];
  /** Component ids currently on the expansion path, to fail closed on a cyclic component graph. */
  readonly activeComponents: ReadonlySet<Id>;
}

interface WalkElementOptions {
  readonly context: WalkContext;
  readonly scope: ReadonlyMap<Id, Element>;
  readonly childrenByParent: ReadonlyMap<Id, readonly Element[]>;
  readonly elementId: Id;
  readonly componentInstancePath: readonly Id[];
  readonly parentElementId: Id | null;
  readonly depth: number;
  /** Element ids already visited on this scope's descent, guarding against cyclic `parentId` chains. */
  readonly visited: ReadonlySet<Id>;
  /** True only for the element a page root instance points at (its id is carried by `rootInstanceId`). */
  readonly isPageRoot: boolean;
}

/**
 * Depth-first walk of an element within a single element scope. A component-instance element expands
 * into its component's root elements; its ordinary `parentId` document children (which validation
 * permits and {@link import('./resolved-address').createPageAddressScope} includes) are ALSO walked, so
 * nothing addressable is dropped. Ordinary children are followed through `parentId`.
 */
function walkElement(options: WalkElementOptions): void {
  const { context, scope, childrenByParent, elementId, componentInstancePath, parentElementId, depth, visited } =
    options;

  if (visited.has(elementId)) return;

  const element = scope.get(elementId);

  if (element === undefined) return;

  context.out.push({
    rootInstanceId: context.rootInstanceId,
    componentInstancePath,
    element,
    parentElementId,
    visible: context.visible,
    depth,
  });

  if (isComponentInstance(element)) {
    // The page root element's id is carried by rootInstanceId, so it is NOT appended to the address
    // path; a nested instance crosses a component boundary and IS appended.
    const childPath = options.isPageRoot ? componentInstancePath : [...componentInstancePath, element.id];

    expandComponentInstance({ context, instance: element, componentInstancePath: childPath, depth });

    // A component-instance PAGE ROOT has no ordinary element scope (createPageAddressScope resolves its
    // content only through the component), so its document children are not part of this page instance.
    // A NESTED instance's ordinary children ARE in the enclosing scope, so fall through to walk them.
    if (options.isPageRoot) return;
  }

  const nextVisited = new Set([...visited, elementId]);

  for (const child of childrenByParent.get(element.id) ?? []) {
    walkElement({
      context,
      scope,
      childrenByParent,
      elementId: child.id,
      componentInstancePath,
      parentElementId: element.id,
      depth: depth + 1,
      visited: nextVisited,
      isPageRoot: false,
    });
  }
}

function expandComponentInstance(options: {
  readonly context: WalkContext;
  readonly instance: ComponentInstanceElement;
  readonly componentInstancePath: readonly Id[];
  readonly depth: number;
}): void {
  const { context, instance, componentInstancePath, depth } = options;
  const component: ComponentSemanticIndex | undefined = context.document.components.get(instance.componentId);

  // Fail closed on a dangling component reference or a cyclic component graph rather than recursing forever.
  if (component === undefined || context.activeComponents.has(instance.componentId)) return;

  const childrenByParent = buildChildrenByParent([...component.elements.values()]);
  const nestedContext: WalkContext = {
    ...context,
    activeComponents: new Set([...context.activeComponents, instance.componentId]),
  };

  // Expand the component's declared root elements in declared order (authoritative stacking order).
  for (const rootElementId of component.component.rootElementIds) {
    walkElement({
      context: nestedContext,
      scope: component.elements,
      childrenByParent,
      elementId: rootElementId,
      componentInstancePath,
      parentElementId: null,
      depth: depth + 1,
      visited: new Set<Id>(),
      isPageRoot: false,
    });
  }
}

/**
 * Resolve the flat instance tree a page composes: every element placed by every page root instance,
 * with ordinary `parentId` descendants and recursively-expanded component instances, addressed by
 * (rootInstanceId, componentInstancePath, elementId) so each row round-trips through
 * {@link import('./resolved-address').resolvePageInstanceElement}. Returns an empty array when the
 * document or page does not exist, or the page places nothing. Dangling root-element and component
 * references, and cyclic parent/component graphs, are handled fail-closed. Per-instance typed-override
 * values are NOT applied — see {@link ResolvedSceneInstance}.
 */
export function resolvePageInstanceTree(options: {
  readonly project: BroadsetProjectV1;
  readonly documentId: Id;
  readonly pageId: Id;
}): readonly ResolvedSceneInstance[] {
  const indexes = createSemanticIndexes(options.project);
  const document = indexes.documents.get(options.documentId);

  if (document === undefined) return [];

  const page = document.pages.get(options.pageId);

  if (page === undefined) return [];

  const childrenByParent = buildChildrenByParent([...document.elements.values()]);
  const out: ResolvedSceneInstance[] = [];

  for (const root of page.rootInstances) {
    walkElement({
      context: {
        document,
        rootInstanceId: root.id,
        visible: root.visible ?? true,
        out,
        activeComponents: new Set<Id>(),
      },
      scope: document.elements,
      childrenByParent,
      elementId: root.elementId,
      componentInstancePath: [],
      parentElementId: null,
      depth: 0,
      visited: new Set<Id>(),
      isPageRoot: true,
    });
  }

  return out;
}
