import type { Diagnostic } from './diagnostics';
import type { BroadsetProjectV1 } from './project';
import type { SemanticIndexes } from './semantic-index';
import { createSemanticError, findDuplicateIdDiagnostics } from './semantic-validation-helpers';

function validateExtensionNamespaces(
  extensions: BroadsetProjectV1['extensions'],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const seen = new Set<string>();

  extensions.forEach((extension, index) => {
    if (seen.has(extension.namespace)) {
      diagnostics.push(
        createSemanticError(
          'extension.duplicate-namespace',
          'Extension namespace must be unique on its owner',
          `${pointer}/${String(index)}/namespace`,
        ),
      );
    }

    seen.add(extension.namespace);
  });
}

export function validateGlobalIdentities(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  diagnostics.push(...findDuplicateIdDiagnostics(indexes.project.documents, '/documents'));
  diagnostics.push(...findDuplicateIdDiagnostics(indexes.project.templateGroups, '/templateGroups'));
  diagnostics.push(...findDuplicateIdDiagnostics(indexes.project.interop.sources, '/interop/sources'));
  diagnostics.push(...findDuplicateIdDiagnostics(indexes.project.interop.records, '/interop/records'));
  validateExtensionNamespaces(indexes.project.extensions, '/extensions', diagnostics);

  indexes.documentList.forEach(({ document }, documentIndex) => {
    const base = `/documents/${String(documentIndex)}`;

    diagnostics.push(...findDuplicateIdDiagnostics(document.elements, `${base}/elements`));
    diagnostics.push(...findDuplicateIdDiagnostics(document.components, `${base}/components`));
    diagnostics.push(...findDuplicateIdDiagnostics(document.pages, `${base}/pages`));
    diagnostics.push(...findDuplicateIdDiagnostics(document.sequences, `${base}/sequences`));
    diagnostics.push(...findDuplicateIdDiagnostics(document.stateMachines, `${base}/stateMachines`));
    diagnostics.push(...findDuplicateIdDiagnostics(document.viewModels, `${base}/viewModels`));
    diagnostics.push(...findDuplicateIdDiagnostics(document.bindings, `${base}/bindings`));
    validateExtensionNamespaces(document.extensions, `${base}/extensions`, diagnostics);
    document.pages.forEach((page, pageIndex) => {
      validateExtensionNamespaces(page.extensions, `${base}/pages/${String(pageIndex)}/extensions`, diagnostics);
    });
    document.components.forEach((component, componentIndex) => {
      const componentBase = `${base}/components/${String(componentIndex)}`;

      validateExtensionNamespaces(component.extensions, `${componentBase}/extensions`, diagnostics);
      component.elements.forEach((element, elementIndex) => {
        validateExtensionNamespaces(
          element.extensions,
          `${componentBase}/elements/${String(elementIndex)}/extensions`,
          diagnostics,
        );
      });
    });
    document.elements.forEach((element, elementIndex) => {
      validateExtensionNamespaces(element.extensions, `${base}/elements/${String(elementIndex)}/extensions`, diagnostics);
    });
  });
}
