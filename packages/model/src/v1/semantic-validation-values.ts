import type { Paint } from './appearance';
import { typedValueMatchesSchema, type ValueSchema } from './data';
import type { Diagnostic } from './diagnostics';
import { compareExactIsoInstants } from './iso-instant';
import type { OutputProfile } from './output-profile';
import type { BroadsetProjectV1 } from './project';
import type { BlobReference } from './resources';
import { greatestCommonDivisor } from './schema-helpers';
import { createSemanticError } from './semantic-validation-helpers';

function addError(diagnostics: Diagnostic[], code: string, message: string, pointer: string): void {
  diagnostics.push(createSemanticError(code, message, pointer));
}

function validateBlob(blob: BlobReference, pointer: string, diagnostics: Diagnostic[]): void {
  if (blob.source.kind === 'package') {
    const expected = `blobs/sha256/${blob.digest.slice('sha256:'.length)}`;

    if (blob.source.path !== expected) {
      addError(
        diagnostics,
        'asset.invalid-blob-source',
        'Package blob path must match its digest',
        `${pointer}/source/path`,
      );
    }
  } else if (blob.source.kind === 'external') {
    if (blob.source.integrity !== blob.digest) {
      addError(
        diagnostics,
        'asset.invalid-blob-source',
        'External integrity must match its digest',
        `${pointer}/source/integrity`,
      );
    }

    if (blob.source.cachedDigest !== undefined && blob.source.cachedDigest !== blob.digest) {
      addError(
        diagnostics,
        'asset.invalid-blob-source',
        'Cached digest must match its digest',
        `${pointer}/source/cachedDigest`,
      );
    }
  }
}

function validatePicturePaint(paint: Paint, pointer: string, diagnostics: Diagnostic[]): void {
  if (paint.kind !== 'picture' || paint.crop === undefined) return;
  if (paint.crop.x + paint.crop.width <= 1 && paint.crop.y + paint.crop.height <= 1) return;
  addError(diagnostics, 'appearance.invalid-rect', 'Normalized picture crop exceeds bounds', `${pointer}/crop`);
}

function validateValueSchema(schema: ValueSchema, pointer: string, diagnostics: Diagnostic[]): void {
  if (
    schema.kind === 'string' &&
    schema.minLength !== undefined &&
    schema.maxLength !== undefined &&
    schema.minLength > schema.maxLength
  ) {
    addError(diagnostics, 'data.invalid-bounds', 'Minimum length must not exceed maximum length', pointer);
  }

  if (
    (schema.kind === 'number' || schema.kind === 'integer') &&
    schema.minimum !== undefined &&
    schema.maximum !== undefined &&
    schema.minimum > schema.maximum
  ) {
    addError(diagnostics, 'data.invalid-bounds', 'Minimum must not exceed maximum', pointer);
  }

  if (
    schema.kind === 'date-time' &&
    schema.earliest !== undefined &&
    schema.latest !== undefined &&
    (compareExactIsoInstants(schema.earliest, schema.latest) ?? 1) > 0
  ) {
    addError(diagnostics, 'data.invalid-bounds', 'Earliest must not exceed latest', pointer);
  }

  if (schema.kind === 'object') {
    schema.fields.forEach((field, index) => {
      validateValueSchema(field.schema, `${pointer}/fields/${String(index)}/schema`, diagnostics);
    });
  } else if (schema.kind === 'array') {
    if (schema.minItems !== undefined && schema.maxItems !== undefined && schema.minItems > schema.maxItems) {
      addError(diagnostics, 'data.invalid-bounds', 'Minimum items must not exceed maximum items', pointer);
    }

    validateValueSchema(schema.items, `${pointer}/items`, diagnostics);
  }
}

function validateOutputProfile(profile: OutputProfile, pointer: string, diagnostics: Diagnostic[]): void {
  if (profile.kind !== 'motion') return;

  if (greatestCommonDivisor(profile.pixelAspectRatio.numerator, profile.pixelAspectRatio.denominator) !== 1) {
    addError(
      diagnostics,
      'output.unreduced-ratio',
      'Pixel aspect ratio must be reduced',
      `${pointer}/pixelAspectRatio`,
    );
  }

  if (greatestCommonDivisor(profile.frameRate.numerator, profile.frameRate.denominator) !== 1) {
    addError(diagnostics, 'output.unreduced-rate', 'Frame rate must be reduced', `${pointer}/frameRate`);
  }

  if (profile.colorSignal.dynamicRange.peakNits < profile.colorSignal.dynamicRange.referenceWhiteNits) {
    addError(
      diagnostics,
      'output.invalid-luminance',
      'Peak must reach reference white',
      `${pointer}/colorSignal/dynamicRange/peakNits`,
    );
  }

  if (profile.safeArea.kind === 'custom') {
    [profile.safeArea.action, profile.safeArea.title].forEach((rect, index) => {
      if (rect.x + rect.width > 1 || rect.y + rect.height > 1) {
        addError(
          diagnostics,
          'output.invalid-safe-area',
          'Normalized rectangle must remain within bounds',
          `${pointer}/safeArea/${index === 0 ? 'action' : 'title'}`,
        );
      }
    });
  }
}

export function validateValueAndResourceInvariants(project: BroadsetProjectV1): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  project.resources.assets.forEach((asset, assetIndex) => {
    const base = `/resources/assets/${String(assetIndex)}`;

    validateBlob(asset.blob, `${base}/blob`, diagnostics);
    asset.derivatives?.forEach((derivative, derivativeIndex) => {
      validateBlob(derivative.blob, `${base}/derivatives/${String(derivativeIndex)}/blob`, diagnostics);
    });

    if (
      asset.kind === 'video' &&
      greatestCommonDivisor(asset.metadata.frameRate.numerator, asset.metadata.frameRate.denominator) !== 1
    ) {
      addError(diagnostics, 'asset.unreduced-rate', 'Frame rate must be reduced', `${base}/metadata/frameRate`);
    }

    if (asset.kind === 'font') {
      asset.metadata.variableAxes.forEach((axis, axisIndex) => {
        if (axis.minimum > axis.defaultValue || axis.defaultValue > axis.maximum) {
          addError(
            diagnostics,
            'asset.invalid-axis-range',
            'Axis default must be within its range',
            `${base}/metadata/variableAxes/${String(axisIndex)}`,
          );
        }
      });
      asset.metadata.unicodeCoverage.forEach((range, rangeIndex) => {
        if (range.start > range.end || (range.start <= 0xdfff && range.end >= 0xd800)) {
          addError(
            diagnostics,
            'asset.invalid-unicode-range',
            'Expected an ordered Unicode scalar range',
            `${base}/metadata/unicodeCoverage/${String(rangeIndex)}`,
          );
        }
      });
    }
  });

  project.resources.variables.forEach((collection, collectionIndex) => {
    const base = `/resources/variables/${String(collectionIndex)}`;
    const modeIds = new Set<string>(collection.modes.map(({ id }) => id));

    if (!modeIds.has(collection.defaultModeId)) {
      addError(diagnostics, 'variable.invalid-default-mode', 'Default mode must resolve', `${base}/defaultModeId`);
    }

    collection.variables.forEach((variable, variableIndex) => {
      const valueEntries = Object.entries(variable.valuesByMode);

      if (valueEntries.length !== modeIds.size || valueEntries.some(([modeId]) => !modeIds.has(modeId))) {
        addError(
          diagnostics,
          'variable.incomplete-mode-values',
          'Variable values must cover every mode',
          `${base}/variables/${String(variableIndex)}/valuesByMode`,
        );
      }

      valueEntries.forEach(([modeId, value]) => {
        if (value.type !== variable.valueType) {
          addError(
            diagnostics,
            'variable.incompatible-value',
            'Variable value must match its declared type',
            `${base}/variables/${String(variableIndex)}/valuesByMode/${modeId}`,
          );
        }
      });
    });
  });

  project.resources.outputProfiles.forEach((profile, index) => {
    validateOutputProfile(profile, `/resources/outputProfiles/${String(index)}`, diagnostics);
  });

  project.documents.forEach((document, documentIndex) => {
    const documentBase = `/documents/${String(documentIndex)}`;

    validatePicturePaint(document.surface.background, `${documentBase}/surface/background`, diagnostics);

    const allElements = [
      ...document.elements.map((element, index) => ({ element, pointer: `${documentBase}/elements/${String(index)}` })),
      ...document.components.flatMap((component, componentIndex) =>
        component.elements.map((element, elementIndex) => ({
          element,
          pointer: `${documentBase}/components/${String(componentIndex)}/elements/${String(elementIndex)}`,
        })),
      ),
    ];

    allElements.forEach(({ element, pointer }) => {
      element.appearance.fills.forEach((fill, index) => {
        validatePicturePaint(fill.paint, `${pointer}/appearance/fills/${String(index)}/paint`, diagnostics);
      });
      element.appearance.strokes.forEach((stroke, index) => {
        validatePicturePaint(stroke.paint, `${pointer}/appearance/strokes/${String(index)}/paint`, diagnostics);
      });
      if (element.kind === 'image') {
        const crop = element.image.crop;

        if (crop !== undefined && (crop.x + crop.width > 1 || crop.y + crop.height > 1)) {
          addError(
            diagnostics,
            'appearance.invalid-rect',
            'Normalized rectangle exceeds bounds',
            `${pointer}/image/crop`,
          );
        }
      } else if (element.kind === 'foreign')
        validateBlob(element.foreign.sourceBlob, `${pointer}/foreign/sourceBlob`, diagnostics);
    });

    document.viewModels.forEach((viewModel, viewModelIndex) => {
      const base = `${documentBase}/viewModels/${String(viewModelIndex)}`;
      const fieldIds = new Set<string>(viewModel.fields.map(({ id }) => id));

      viewModel.fields.forEach((field, fieldIndex) => {
        const fieldBase = `${base}/fields/${String(fieldIndex)}`;

        validateValueSchema(field.schema, `${fieldBase}/schema`, diagnostics);

        if (field.defaultValue !== undefined && !typedValueMatchesSchema(field.defaultValue, field.schema)) {
          addError(
            diagnostics,
            'data.incompatible-default',
            'Default value does not match schema',
            `${fieldBase}/defaultValue`,
          );
        }
      });
      viewModel.sampleDataSets.forEach((sample, sampleIndex) => {
        const sampleBase = `${base}/sampleDataSets/${String(sampleIndex)}/values`;

        viewModel.fields.forEach((field) => {
          const value = sample.values[field.id];

          if (value === undefined || !typedValueMatchesSchema(value, field.schema)) {
            addError(
              diagnostics,
              'data.incompatible-sample',
              'Sample value is missing or incompatible',
              `${sampleBase}/${field.id}`,
            );
          }
        });
        Object.keys(sample.values).forEach((fieldId) => {
          if (!fieldIds.has(fieldId)) {
            addError(
              diagnostics,
              'data.unknown-sample-field',
              'Sample references unknown field',
              `${sampleBase}/${fieldId}`,
            );
          }
        });
      });
    });

    document.components.forEach((component, componentIndex) => {
      component.exposedProperties.forEach((property, propertyIndex) => {
        property.constraints.forEach((constraint, constraintIndex) => {
          if (
            (constraint.kind === 'numeric-range' || constraint.kind === 'string-length') &&
            constraint.minimum !== undefined &&
            constraint.maximum !== undefined &&
            constraint.minimum > constraint.maximum
          ) {
            addError(
              diagnostics,
              'component.invalid-constraint-range',
              'Constraint minimum must not exceed maximum',
              `${documentBase}/components/${String(componentIndex)}/exposedProperties/${String(propertyIndex)}/constraints/${String(constraintIndex)}`,
            );
          }
        });
      });
    });
  });

  return diagnostics;
}
