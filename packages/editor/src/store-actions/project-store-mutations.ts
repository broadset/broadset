import { projectFormatV1 } from '@broadset/model';

export type ProjectReorderDirection = 'forward' | 'backward' | 'front' | 'back';

function isValidProject(project: projectFormatV1.BroadsetProjectV1): boolean {
  const hasStructuralFailure = projectFormatV1
    .parseProjectV1Unknown(project)
    .diagnostics.some((diagnostic) => diagnostic.code === 'structural-invalid');

  return !hasStructuralFailure && projectFormatV1.validateBroadsetProjectV1Semantics(project).length === 0;
}

export function insertElementIntoProject(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly element: projectFormatV1.Element;
}): projectFormatV1.BroadsetProjectV1 {
  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);

  if (document === undefined || document.elements.some((element) => element.id === options.element.id)) {
    return options.project;
  }

  const hasValidParent =
    options.element.parentId === null ||
    document.elements.some((element) => element.id === options.element.parentId && element.kind === 'group');

  if (!hasValidParent) return options.project;

  const nextDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    elements: [...document.elements, options.element],
    pages: document.pages.map((page) => ({
      ...page,
      rootInstances:
        page.id === options.pageId && options.element.parentId === null
          ? [
              ...page.rootInstances,
              {
                id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
                elementId: options.element.id,
                overrides: [],
                componentPropertyValues: [],
              },
            ]
          : page.rootInstances,
    })),
  };
  const candidate: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((entry) => (entry.id === options.documentId ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : options.project;
}

export function updateElementInProject(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly elementId: projectFormatV1.Id;
  readonly updater: (element: projectFormatV1.Element) => projectFormatV1.Element;
}): projectFormatV1.BroadsetProjectV1 {
  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);
  const element = document?.elements.find((candidate) => candidate.id === options.elementId);

  if (document === undefined || element === undefined) return options.project;

  const nextElement = options.updater(element);

  if (nextElement === element || nextElement.id !== element.id) return options.project;

  const nextDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    elements: document.elements.map((candidate) => (candidate.id === element.id ? nextElement : candidate)),
  };
  const candidate: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((entry) => (entry.id === document.id ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : options.project;
}

export function updateElementsInProject(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly elementIds: ReadonlySet<projectFormatV1.Id>;
  readonly updater: (element: projectFormatV1.Element) => projectFormatV1.Element;
}): projectFormatV1.BroadsetProjectV1 {
  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);

  if (document === undefined || options.elementIds.size === 0) return options.project;

  const elements = document.elements.map((element) => {
    if (!options.elementIds.has(element.id)) return element;

    const nextElement = options.updater(element);

    if (nextElement.id !== element.id) return element;

    return nextElement;
  });

  if (elements.every((element, index) => element === document.elements[index])) return options.project;

  const nextDocument: projectFormatV1.BroadsetDocumentV1 = { ...document, elements };
  const candidate: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((entry) => (entry.id === document.id ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : options.project;
}

function collectSubtreeIds(
  elements: readonly projectFormatV1.Element[],
  rootElementId: projectFormatV1.Id,
): ReadonlySet<projectFormatV1.Id> {
  const subtreeIds = new Set<projectFormatV1.Id>([rootElementId]);
  let previousSize = -1;

  while (previousSize !== subtreeIds.size) {
    previousSize = subtreeIds.size;
    elements.forEach((element) => {
      if (element.parentId !== null && subtreeIds.has(element.parentId)) subtreeIds.add(element.id);
    });
  }

  return subtreeIds;
}

export function reparentElementInProject(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id | null;
}): projectFormatV1.BroadsetProjectV1 {
  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);
  const element = document?.elements.find((candidate) => candidate.id === options.elementId);

  if (document === undefined || element === undefined || element.parentId === options.parentId) return options.project;

  const subtreeIds = collectSubtreeIds(document.elements, element.id);
  const parent =
    options.parentId === null ? undefined : document.elements.find((candidate) => candidate.id === options.parentId);

  if (options.parentId !== null && (parent?.kind !== 'group' || subtreeIds.has(options.parentId))) {
    return options.project;
  }

  const nextDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    elements: document.elements.map((candidate) =>
      candidate.id === element.id ? { ...candidate, parentId: options.parentId } : candidate,
    ),
    pages: document.pages.map((page) => {
      const withoutMovedRoot = page.rootInstances.filter((instance) => instance.elementId !== element.id);
      const shouldAddRoot = element.parentId !== null && options.parentId === null && page.id === options.pageId;
      let rootInstances = page.rootInstances;

      if (options.parentId !== null) rootInstances = withoutMovedRoot;

      if (shouldAddRoot) {
        rootInstances = [
          ...withoutMovedRoot,
          {
            id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
            elementId: element.id,
            overrides: [],
            componentPropertyValues: [],
          },
        ];
      }

      return {
        ...page,
        rootInstances,
        descendantOverrides: page.descendantOverrides.filter(
          (entry) => !subtreeIds.has(entry.address.elementId),
        ),
      };
    }),
  };
  const candidate: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((entry) => (entry.id === document.id ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : options.project;
}

function resolveReorderDestination(options: {
  readonly currentIndex: number;
  readonly lastIndex: number;
  readonly direction: ProjectReorderDirection;
}): number {
  switch (options.direction) {
    case 'back':
      return 0;
    case 'backward':
      return Math.max(0, options.currentIndex - 1);
    case 'forward':
      return Math.min(options.lastIndex, options.currentIndex + 1);
    case 'front':
      return options.lastIndex;
  }
}

export function reorderElementInProject(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly elementId: projectFormatV1.Id;
  readonly direction: ProjectReorderDirection;
}): projectFormatV1.BroadsetProjectV1 {
  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);
  const element = document?.elements.find((candidate) => candidate.id === options.elementId);

  if (document === undefined || element === undefined) return options.project;

  const siblingIndexes = document.elements
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.parentId === element.parentId)
    .map(({ index }) => index);
  const siblings = siblingIndexes.map((index) => document.elements[index]).filter((candidate) => candidate !== undefined);
  const currentIndex = siblings.findIndex((candidate) => candidate.id === element.id);
  const destinationIndex = resolveReorderDestination({
    currentIndex,
    lastIndex: siblings.length - 1,
    direction: options.direction,
  });

  if (currentIndex < 0 || currentIndex === destinationIndex) return options.project;

  const reorderedSiblings = [...siblings];
  const removed = reorderedSiblings.splice(currentIndex, 1)[0];

  if (removed === undefined) return options.project;

  reorderedSiblings.splice(destinationIndex, 0, removed);

  const replacements = new Map(
    siblingIndexes.map((elementIndex, siblingIndex) => [elementIndex, reorderedSiblings[siblingIndex]]),
  );
  const nextDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    elements: document.elements.map((candidate, index) => replacements.get(index) ?? candidate),
  };
  const candidate: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((entry) => (entry.id === document.id ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : options.project;
}
