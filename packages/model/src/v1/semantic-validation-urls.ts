import type { ComponentDefinition } from './component';
import type { ExpressionAst } from './data';
import type { Diagnostic } from './diagnostics';
import type { Element } from './element';
import type { Id, PropertyTarget } from './identity';
import type { ExtensionEnvelope } from './json-value';
import type { BroadsetProjectV1 } from './project';
import type { BlobReference } from './resources';
import { createSemanticError } from './semantic-validation-helpers';
import type { Sequence } from './sequence';
import type { TypedValue } from './typed-value';

const INVALID_URI_CHARACTER_PATTERN = /[^A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/u;
const INVALID_PERCENT_ESCAPE_PATTERN = /%(?![0-9A-Fa-f]{2})/u;

function rawAuthority(value: string): string | undefined {
  const afterScheme = value.slice(value.indexOf(':') + 1);

  if (!afterScheme.startsWith('//')) return undefined;

  return afterScheme.slice(2).split(/[/?#]/u, 1)[0];
}

function hasInvalidExplicitPort(authority: string): boolean {
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  const closingBracket = hostPort.startsWith('[') ? hostPort.indexOf(']') : -1;
  const portSeparator = closingBracket >= 0 ? closingBracket + 1 : hostPort.lastIndexOf(':');

  if (portSeparator < 0 || hostPort[portSeparator] !== ':') return false;

  const port = hostPort.slice(portSeparator + 1);

  return port.length === 0 || !/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65_535;
}

function validateAuthority(parsed: URL, authority: string, pointer: string, diagnostics: Diagnostic[]): void {
  if (authority.includes('@')) {
    diagnostics.push(createSemanticError('url.credentials-not-allowed', 'URL authority must not contain credentials', pointer));
  }

  const rawHost = authority.slice(authority.lastIndexOf('@') + 1).split(':', 1)[0];

  if (!parsed.hostname.startsWith('[') && rawHost?.includes('%')) {
    diagnostics.push(createSemanticError('url.invalid-authority', 'URL host name is invalid', pointer));
  }

  if (parsed.hostname.length === 0 || parsed.hostname.startsWith('[')) return;

  const hostname = parsed.hostname.endsWith('.') ? parsed.hostname.slice(0, -1) : parsed.hostname;
  const labels = hostname.split('.');

  if (
    hostname.length > 253 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        label.startsWith('-') ||
        label.endsWith('-') ||
        !/^[A-Za-z0-9-]+$/u.test(label),
    )
  ) {
    diagnostics.push(createSemanticError('url.invalid-authority', 'URL host name is invalid', pointer));
  }
}

function validateUrl(value: string, pointer: string, httpsOnly: boolean, diagnostics: Diagnostic[]): void {
  if (
    value.includes('\\') ||
    INVALID_URI_CHARACTER_PATTERN.test(value) ||
    INVALID_PERCENT_ESCAPE_PATTERN.test(value)
  ) {
    diagnostics.push(createSemanticError('url.invalid', 'URL contains invalid URI syntax', pointer));

    return;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    diagnostics.push(createSemanticError('url.invalid', 'URL is not a valid absolute URL', pointer));

    return;
  }

  if (httpsOnly && parsed.protocol.toLowerCase() !== 'https:') {
    diagnostics.push(createSemanticError('url.invalid-https', 'Expected a valid absolute HTTPS URL', pointer));

    return;
  }

  const hierarchical = httpsOnly || value.slice(value.indexOf(':') + 1).startsWith('//');

  if (!hierarchical) return;

  const authority = rawAuthority(value);

  if (authority === undefined || hasInvalidExplicitPort(authority)) {
    diagnostics.push(createSemanticError('url.invalid-port', 'URL port must be between 1 and 65535', pointer));

    return;
  }

  if (httpsOnly && parsed.hostname.length === 0) {
    diagnostics.push(createSemanticError('url.invalid-authority', 'URL authority requires a host', pointer));

    return;
  }

  validateAuthority(parsed, authority, pointer, diagnostics);
}

function isHyperlinkTarget(target: PropertyTarget): boolean {
  return target.pointer === '/properties/hyperlink';
}

function validateHyperlinkValue(value: TypedValue, pointer: string, diagnostics: Diagnostic[]): void {
  if (value.type === 'string') validateUrl(value.value, `${pointer}/value`, true, diagnostics);
}

function validateHyperlinkExpression(expression: ExpressionAst, pointer: string, diagnostics: Diagnostic[]): void {
  if (expression.kind === 'literal') {
    validateHyperlinkValue(expression.value, `${pointer}/value`, diagnostics);

    return;
  }

  diagnostics.push(
    createSemanticError(
      'url.dynamic-hyperlink',
      'Dynamic hyperlink bindings cannot be proven to resolve to a safe HTTPS URL',
      pointer,
    ),
  );
}

function validateSequenceHyperlinks(sequence: Sequence, pointer: string, diagnostics: Diagnostic[]): void {
  sequence.tracks.forEach((track, trackIndex) => {
    if (!isHyperlinkTarget(track.target)) return;
    track.keyframes.forEach((keyframe, keyframeIndex) => {
      validateHyperlinkValue(
        keyframe.value,
        `${pointer}/tracks/${String(trackIndex)}/keyframes/${String(keyframeIndex)}/value`,
        diagnostics,
      );
    });
  });
}

function isHyperlinkProperty(property: ComponentDefinition['exposedProperties'][number]): boolean {
  return property.bindings.some(({ target }) => isHyperlinkTarget(target));
}

function validateComponentPropertyValues(
  hyperlinkPropertyIds: ReadonlySet<Id> | undefined,
  values: readonly { readonly exposedPropertyId: Id; readonly value: TypedValue }[],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (hyperlinkPropertyIds === undefined) return;

  values.forEach((value, valueIndex) => {
    if (hyperlinkPropertyIds.has(value.exposedPropertyId))
      validateHyperlinkValue(value.value, `${pointer}/${String(valueIndex)}/value`, diagnostics);
  });
}

function validateElementComponentValues(
  elements: readonly Element[],
  componentHyperlinkPropertyIds: ReadonlyMap<Id, ReadonlySet<Id>>,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  elements.forEach((element, elementIndex) => {
    if (element.kind === 'component-instance')
      validateComponentPropertyValues(
        componentHyperlinkPropertyIds.get(element.componentId),
        element.propertyValues,
        `${pointer}/${String(elementIndex)}/propertyValues`,
        diagnostics,
      );
  });
}

function validateExtensions(extensions: readonly ExtensionEnvelope[], pointer: string, diagnostics: Diagnostic[]): void {
  extensions.forEach((extension, index) => {
    validateUrl(extension.schema, `${pointer}/${String(index)}/schema`, true, diagnostics);
  });
}

function validateBlobUrl(blob: BlobReference, pointer: string, diagnostics: Diagnostic[]): void {
  if (blob.source.kind === 'external') validateUrl(blob.source.url, `${pointer}/source/url`, true, diagnostics);
}

function validateTextHyperlinks(
  text: BroadsetProjectV1['documents'][number]['pages'][number]['notes'],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  text?.paragraphs.forEach((paragraph, paragraphIndex) => {
    paragraph.runs.forEach((run, runIndex) => {
      if (run.properties.hyperlink !== undefined)
        validateUrl(
          run.properties.hyperlink,
          `${pointer}/paragraphs/${String(paragraphIndex)}/runs/${String(runIndex)}/properties/hyperlink`,
          true,
          diagnostics,
        );
    });
  });
}

export function validateProjectUrls(project: BroadsetProjectV1): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  validateExtensions(project.extensions, '/extensions', diagnostics);
  project.resources.assets.forEach((asset, assetIndex) => {
    const base = `/resources/assets/${String(assetIndex)}`;

    validateBlobUrl(asset.blob, `${base}/blob`, diagnostics);
    asset.derivatives?.forEach((derivative, derivativeIndex) => {
      validateBlobUrl(derivative.blob, `${base}/derivatives/${String(derivativeIndex)}/blob`, diagnostics);
    });
    if (asset.provenance?.kind === 'imported' && asset.provenance.sourceUri !== undefined)
      validateUrl(asset.provenance.sourceUri, `${base}/provenance/sourceUri`, false, diagnostics);
    if (asset.license?.url !== undefined) validateUrl(asset.license.url, `${base}/license/url`, false, diagnostics);
    if (asset.kind === 'data' && asset.metadata.schemaUri !== undefined)
      validateUrl(asset.metadata.schemaUri, `${base}/metadata/schemaUri`, false, diagnostics);
  });
  project.resources.styles.forEach((style, styleIndex) => {
    if (style.kind !== 'text' || style.source.kind !== 'properties') return;
    style.source.entries.forEach((entry, entryIndex) => {
      if (entry.pointer === '/hyperlink' && entry.value.type === 'string')
        validateUrl(
          entry.value.value,
          `/resources/styles/${String(styleIndex)}/source/entries/${String(entryIndex)}/value/value`,
          true,
          diagnostics,
        );
    });
  });
  project.interop.records.forEach((record, recordIndex) => {
    if (record.preservedBlob !== undefined)
      validateBlobUrl(record.preservedBlob, `/interop/records/${String(recordIndex)}/preservedBlob`, diagnostics);
  });
  project.documents.forEach((document, documentIndex) => {
    const base = `/documents/${String(documentIndex)}`;
    const elements = new Map(document.elements.map((element) => [element.id, element]));
    const componentHyperlinkPropertyIds = new Map(
      document.components.map((component) => [
        component.id,
        new Set(component.exposedProperties.filter(isHyperlinkProperty).map(({ id }) => id)),
      ]),
    );

    validateExtensions(document.extensions, `${base}/extensions`, diagnostics);
    document.pages.forEach((page, pageIndex) => {
      const pageBase = `${base}/pages/${String(pageIndex)}`;

      validateExtensions(page.extensions, `${pageBase}/extensions`, diagnostics);
      validateTextHyperlinks(page.notes, `${pageBase}/notes`, diagnostics);
      page.rootInstances.forEach((root, rootIndex) => {
        root.overrides.forEach((override, overrideIndex) => {
          if (isHyperlinkTarget(override.target))
            validateHyperlinkValue(
              override.value,
              `${pageBase}/rootInstances/${String(rootIndex)}/overrides/${String(overrideIndex)}/value`,
              diagnostics,
            );
        });

        const rootElement = elements.get(root.elementId);
        const hyperlinkPropertyIds =
          rootElement?.kind === 'component-instance'
            ? componentHyperlinkPropertyIds.get(rootElement.componentId)
            : undefined;

        validateComponentPropertyValues(
          hyperlinkPropertyIds,
          root.componentPropertyValues,
          `${pageBase}/rootInstances/${String(rootIndex)}/componentPropertyValues`,
          diagnostics,
        );
      });
      page.descendantOverrides.forEach((override, overrideIndex) => {
        override.overrides.forEach((typedOverride, typedOverrideIndex) => {
          if (isHyperlinkTarget(typedOverride.target))
            validateHyperlinkValue(
              typedOverride.value,
              `${pageBase}/descendantOverrides/${String(overrideIndex)}/overrides/${String(typedOverrideIndex)}/value`,
              diagnostics,
            );
        });
      });
    });

    const validateElements = (elements: typeof document.elements, pointer: string): void => {
      elements.forEach((element, elementIndex) => {
        const elementBase = `${pointer}/${String(elementIndex)}`;

        validateExtensions(element.extensions, `${elementBase}/extensions`, diagnostics);
        if (element.kind === 'foreign') validateBlobUrl(element.foreign.sourceBlob, `${elementBase}/foreign/sourceBlob`, diagnostics);
        if (element.kind === 'text') validateTextHyperlinks(element.text, `${elementBase}/text`, diagnostics);
      });
    };

    validateElements(document.elements, `${base}/elements`);
    validateElementComponentValues(document.elements, componentHyperlinkPropertyIds, `${base}/elements`, diagnostics);
    document.sequences.forEach((sequence, sequenceIndex) => {
      validateSequenceHyperlinks(sequence, `${base}/sequences/${String(sequenceIndex)}`, diagnostics);
    });
    document.stateMachines.forEach((machine, machineIndex) => {
      machine.states.forEach((state, stateIndex) => {
        state.values.forEach((stateValue, stateValueIndex) => {
          if (isHyperlinkTarget(stateValue.target))
            validateHyperlinkValue(
              stateValue.value,
              `${base}/stateMachines/${String(machineIndex)}/states/${String(stateIndex)}/values/${String(stateValueIndex)}/value`,
              diagnostics,
            );
        });
      });
    });
    document.bindings.forEach((binding, bindingIndex) => {
      if (!isHyperlinkTarget(binding.target)) return;

      const bindingBase = `${base}/bindings/${String(bindingIndex)}`;

      validateHyperlinkExpression(binding.expression, `${bindingBase}/expression`, diagnostics);
      if (binding.fallback !== undefined)
        validateHyperlinkValue(binding.fallback, `${bindingBase}/fallback`, diagnostics);
      if (binding.formatter !== undefined)
        diagnostics.push(
          createSemanticError(
            'url.dynamic-hyperlink',
            'Formatted hyperlink bindings cannot be proven to resolve to a safe HTTPS URL',
            `${bindingBase}/formatter`,
          ),
        );
    });
    document.components.forEach((component, componentIndex) => {
      const componentBase = `${base}/components/${String(componentIndex)}`;

      validateExtensions(component.extensions, `${componentBase}/extensions`, diagnostics);
      validateElements(component.elements, `${componentBase}/elements`);
      validateElementComponentValues(
        component.elements,
        componentHyperlinkPropertyIds,
        `${componentBase}/elements`,
        diagnostics,
      );
      component.sequences.forEach((sequence, sequenceIndex) => {
        validateSequenceHyperlinks(sequence, `${componentBase}/sequences/${String(sequenceIndex)}`, diagnostics);
      });
      component.exposedProperties.forEach((property, propertyIndex) => {
        if (!isHyperlinkProperty(property)) return;

        const propertyBase = `${componentBase}/exposedProperties/${String(propertyIndex)}`;

        validateHyperlinkValue(property.defaultValue, `${propertyBase}/defaultValue`, diagnostics);
        property.constraints.forEach((constraint, constraintIndex) => {
          if (constraint.kind !== 'allowed-values') return;
          constraint.values.forEach((value, valueIndex) => {
            validateHyperlinkValue(
              value,
              `${propertyBase}/constraints/${String(constraintIndex)}/values/${String(valueIndex)}`,
              diagnostics,
            );
          });
        });
      });
    });
  });

  return diagnostics;
}
