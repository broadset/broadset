import type { ColorValue } from './color';
import type { Diagnostic } from './diagnostics';
import type { Element } from './element';
import type { Id } from './identity';
import type { SemanticIndexes } from './semantic-index';
import { createSemanticError } from './semantic-validation-helpers';

function validateColor(indexes: SemanticIndexes, color: ColorValue, pointer: string, diagnostics: Diagnostic[]): void {
  if (color.kind === 'swatch' && !indexes.swatches.has(color.swatchId)) diagnostics.push(createSemanticError('resource.missing-reference', 'Swatch does not resolve', `${pointer}/swatchId`));
}

function validateVectorReference(elements: ReadonlyMap<Id, Element>, elementId: Id, pointer: string, diagnostics: Diagnostic[]): void {
  if (elements.get(elementId)?.kind !== 'vector') diagnostics.push(createSemanticError('element.invalid-vector-reference', 'Vector element does not resolve', pointer));
}

export function validateElementReferences(indexes: SemanticIndexes, elements: ReadonlyMap<Id, Element>, element: Element, pointer: string, diagnostics: Diagnostic[]): void {
  if (element.kind === 'text' && element.textPath !== undefined) validateVectorReference(elements, element.textPath.vectorElementId, `${pointer}/textPath/vectorElementId`, diagnostics);

  if (element.kind === 'vector' && element.geometryData.kind === 'boolean') {
    if (element.geometryData.operandIds.length < 2) diagnostics.push(createSemanticError('element.invalid-boolean-operands', 'Boolean geometry requires at least two operands', `${pointer}/geometryData/operandIds`));
    element.geometryData.operandIds.forEach((operandId, index) => {
      if (operandId === element.id || elements.get(operandId)?.kind !== 'vector') diagnostics.push(createSemanticError('element.invalid-vector-reference', 'Boolean operand does not resolve to another vector', `${pointer}/geometryData/operandIds/${String(index)}`));
    });
  }

  const clip = element.appearance.clip;

  if (clip?.kind === 'vector') validateVectorReference(elements, clip.vectorElementId, `${pointer}/appearance/clip/vectorElementId`, diagnostics);

  const mask = element.appearance.mask;

  if (mask?.kind === 'vector') validateVectorReference(elements, mask.vectorElementId, `${pointer}/appearance/mask/vectorElementId`, diagnostics);
  [...element.appearance.fills, ...element.appearance.strokes].forEach((layer, layerIndex) => {
    const paintPointer = `${pointer}/appearance/layers/${String(layerIndex)}/paint`;

    if (layer.paint.kind === 'solid') validateColor(indexes, layer.paint.color, `${paintPointer}/color`, diagnostics);
    if (layer.paint.kind === 'gradient') layer.paint.gradient.stops.forEach((stop, stopIndex) => { validateColor(indexes, stop.color, `${paintPointer}/gradient/stops/${String(stopIndex)}/color`, diagnostics); });
  });
  element.appearance.effects.forEach((effect, effectIndex) => {
    const effectPointer = `${pointer}/appearance/effects/${String(effectIndex)}`;

    if (effect.kind === 'drop-shadow' || effect.kind === 'inner-shadow' || effect.kind === 'glow') validateColor(indexes, effect.color, `${effectPointer}/color`, diagnostics);

    if (effect.kind === 'bevel') {
      validateColor(indexes, effect.highlightColor, `${effectPointer}/highlightColor`, diagnostics);
      validateColor(indexes, effect.shadowColor, `${effectPointer}/shadowColor`, diagnostics);
    }
  });
  if (element.kind === 'text') element.text.paragraphs.forEach((paragraph, paragraphIndex) => { paragraph.runs.forEach((run, runIndex) => {
    const runPointer = `${pointer}/text/paragraphs/${String(paragraphIndex)}/runs/${String(runIndex)}/properties`;

    validateColor(indexes, run.properties.color, `${runPointer}/color`, diagnostics);
    if (run.properties.decoration.color !== undefined) validateColor(indexes, run.properties.decoration.color, `${runPointer}/decoration/color`, diagnostics);
  }); });
}
