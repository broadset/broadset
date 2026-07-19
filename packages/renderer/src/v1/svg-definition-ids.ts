const DOCUMENT_NAMESPACE_SEQUENCE = Symbol.for('broadset.renderer.svg-definition-namespace-sequence');

export type SvgDefinitionIdFactoryV1 = (prefix: string) => string;

/** Allocate IDs from a document-shared namespace that survives duplicate bundles and hot reloads. */
export function createSvgDefinitionIdFactoryV1(document: Document): SvgDefinitionIdFactoryV1 {
  const stored: unknown = Reflect.get(document, DOCUMENT_NAMESPACE_SEQUENCE);
  const documentSequence = typeof stored === 'number' && Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  const namespace = documentSequence + 1;

  Reflect.set(document, DOCUMENT_NAMESPACE_SEQUENCE, namespace);

  let definitionSequence = 0;

  return (prefix): string => {
    definitionSequence += 1;

    return `broadset-${prefix}-${String(namespace)}-${String(definitionSequence)}`;
  };
}
