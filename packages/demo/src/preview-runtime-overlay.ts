import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetFill,
  broadsetFillSchema,
  gradientFill,
  isGradientFill,
  migrateLegacyColor,
  solidFill,
} from '@broadset/model';
import {
  applyGradientPropertyUpdates,
  type GradientPropertyUpdate,
  isGradientAnimationTarget,
  parseGradientTarget,
  type TimelineFrame,
} from '@broadset/playback';

import { parseCssGradient, resolveSolidFillColorForGradientClear } from './gradient-css';

export interface RuntimeTimelineOverlay {
  readonly elementId: string;
  readonly frame: TimelineFrame;
}

interface ElementRuntimePatch {
  readonly content?: BroadsetElement['content'] | undefined;
  readonly position?: BroadsetElement['position'] | undefined;
  readonly rotation?: number | undefined;
  readonly style?: Partial<BroadsetElementStyle> | undefined;
}

interface PropertyPatchResult {
  readonly patch: ElementRuntimePatch;
  readonly gradientUpdate?: GradientPropertyUpdate | undefined;
}

interface AxisRuntimeValues {
  readonly x?: number | undefined;
  readonly y?: number | undefined;
  readonly translateX?: number | undefined;
  readonly translateY?: number | undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseFillValue(value: unknown): BroadsetFill | null {
  const fillResult = broadsetFillSchema.safeParse(value);

  if (fillResult.success) {
    return fillResult.data;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const color = migrateLegacyColor(value);

    return color === undefined ? null : solidFill(color);
  } catch {
    return null;
  }
}

function patchWithStyle(patch: ElementRuntimePatch, style: Partial<BroadsetElementStyle>): ElementRuntimePatch {
  return { ...patch, style: { ...patch.style, ...style } };
}

function patchGradientProperty(
  propertyName: string,
  value: unknown,
  patch: ElementRuntimePatch,
): PropertyPatchResult | null {
  if (isGradientAnimationTarget(propertyName)) {
    const target = parseGradientTarget(propertyName);

    return target === null ? { patch } : { patch, gradientUpdate: { target, value } };
  }

  return null;
}

export function isPreviewDocumentRuntimeProperty(propertyName: string): boolean {
  if (isGradientAnimationTarget(propertyName)) {
    return true;
  }

  switch (propertyName) {
    case 'opacity':
    case 'content':
    case 'textContent':
    case 'd':
    case 'fill':
    case 'backgroundColor':
    case 'x':
    case 'y':
    case 'translateX':
    case 'translateY':
    case 'rotation':
    case 'rotateX':
    case 'rotateY':
    case 'rotateZ':
    case 'translateZ':
    case 'trimStart':
    case 'trimEnd':
    case 'trimOffset':
      return true;

    default:
      return false;
  }
}

function patchFillProperty(value: unknown, patch: ElementRuntimePatch): PropertyPatchResult {
  const fill = parseFillValue(value);

  return fill === null ? { patch } : { patch: patchWithStyle(patch, { fill }) };
}

function patchBackgroundGradientProperty(
  baseElement: BroadsetElement,
  value: unknown,
  patch: ElementRuntimePatch,
): PropertyPatchResult {
  const stringValue = String(value);

  if (stringValue.trim() === '') {
    return {
      patch: patchWithStyle(patch, { fill: solidFill(resolveSolidFillColorForGradientClear(baseElement)) }),
    };
  }

  const gradient = parseCssGradient(stringValue);

  return gradient === null ? { patch } : { patch: patchWithStyle(patch, { fill: gradientFill(gradient) }) };
}

function patchStyleNumberProperty(
  propertyName: string,
  value: unknown,
  patch: ElementRuntimePatch,
): PropertyPatchResult | null {
  if (!isFiniteNumber(value)) {
    return null;
  }

  switch (propertyName) {
    case 'rotateX':
      return { patch: patchWithStyle(patch, { rotateX: value }) };

    case 'rotateY':
      return { patch: patchWithStyle(patch, { rotateY: value }) };

    case 'rotateZ':
      return { patch: patchWithStyle(patch, { rotateZ: value }) };

    case 'translateZ':
      return { patch: patchWithStyle(patch, { translateZ: value }) };

    case 'trimStart':
      return { patch: patchWithStyle(patch, { trimStart: value }) };

    case 'trimEnd':
      return { patch: patchWithStyle(patch, { trimEnd: value }) };

    case 'trimOffset':
      return { patch: patchWithStyle(patch, { trimOffset: value }) };

    default:
      return null;
  }
}

function patchWithProperty(
  baseElement: BroadsetElement,
  propertyName: string,
  value: unknown,
  patch: ElementRuntimePatch,
): PropertyPatchResult {
  const gradientResult = patchGradientProperty(propertyName, value, patch);

  if (gradientResult !== null) {
    return gradientResult;
  }

  const styleNumberResult = patchStyleNumberProperty(propertyName, value, patch);

  if (styleNumberResult !== null) {
    return styleNumberResult;
  }

  switch (propertyName) {
    case 'opacity':
      return isFiniteNumber(value) ? { patch: patchWithStyle(patch, { opacity: value }) } : { patch };

    case 'content':
    case 'textContent':
      return { patch: { ...patch, content: String(value) } };

    case 'd':
      return { patch: { ...patch, content: String(value) } };

    case 'fill':
      return patchFillProperty(value, patch);

    case 'backgroundColor':
      return patchFillProperty(value, patch);

    case 'backgroundGradient':
      return patchBackgroundGradientProperty(baseElement, value, patch);

    case 'rotation':
      return isFiniteNumber(value) ? { patch: { ...patch, rotation: value } } : { patch };

    default:
      return { patch };
  }
}

function collectAxisRuntimeValue(
  axisValues: AxisRuntimeValues,
  propertyName: string,
  value: unknown,
): AxisRuntimeValues | null {
  if (!isFiniteNumber(value)) {
    return null;
  }

  switch (propertyName) {
    case 'x':
    case 'y':
    case 'translateX':
    case 'translateY':
      return { ...axisValues, [propertyName]: value };

    default:
      return null;
  }
}

function applyAxisRuntimeValues(
  baseElement: BroadsetElement,
  patch: ElementRuntimePatch,
  axisValues: AxisRuntimeValues,
): ElementRuntimePatch {
  if (
    axisValues.x === undefined &&
    axisValues.y === undefined &&
    axisValues.translateX === undefined &&
    axisValues.translateY === undefined
  ) {
    return patch;
  }

  return {
    ...patch,
    position: {
      ...(patch.position ?? baseElement.position),
      x: (axisValues.x ?? baseElement.position.x) + (axisValues.translateX ?? 0),
      y: (axisValues.y ?? baseElement.position.y) + (axisValues.translateY ?? 0),
    },
  };
}

function applyGradientUpdates(
  baseElement: BroadsetElement,
  patch: ElementRuntimePatch,
  gradientUpdates: readonly GradientPropertyUpdate[],
): ElementRuntimePatch {
  if (gradientUpdates.length === 0 || !isGradientFill(baseElement.style.fill)) {
    return patch;
  }

  return {
    ...patch,
    style: {
      ...patch.style,
      fill: gradientFill(applyGradientPropertyUpdates(baseElement.style.fill.gradient, gradientUpdates)),
    },
  };
}

function composeElementPatch(
  baseElement: BroadsetElement,
  properties: Readonly<Record<string, unknown>>,
): ElementRuntimePatch {
  let patch: ElementRuntimePatch = {};
  let gradientUpdates: GradientPropertyUpdate[] = [];
  let axisValues: AxisRuntimeValues = {};

  for (const [propertyName, value] of Object.entries(properties)) {
    const nextAxisValues = collectAxisRuntimeValue(axisValues, propertyName, value);

    if (nextAxisValues !== null) {
      axisValues = nextAxisValues;

      continue;
    }

    const result = patchWithProperty(baseElement, propertyName, value, patch);

    patch = result.patch;

    if (result.gradientUpdate !== undefined) {
      gradientUpdates = [...gradientUpdates, result.gradientUpdate];
    }
  }

  return applyAxisRuntimeValues(baseElement, applyGradientUpdates(baseElement, patch, gradientUpdates), axisValues);
}

function hasPatch(patch: ElementRuntimePatch): boolean {
  return (
    patch.content !== undefined ||
    patch.position !== undefined ||
    patch.rotation !== undefined ||
    patch.style !== undefined
  );
}

function applyPatchToElement(element: BroadsetElement, patch: ElementRuntimePatch): BroadsetElement {
  return {
    ...element,
    ...(patch.content === undefined ? {} : { content: patch.content }),
    ...(patch.position === undefined ? {} : { position: patch.position }),
    ...(patch.rotation === undefined ? {} : { rotation: patch.rotation }),
    ...(patch.style === undefined ? {} : { style: { ...element.style, ...patch.style } }),
  };
}

export function composePreviewDocumentWithRuntimeOverlay(
  document: BroadsetDocument,
  overlay: RuntimeTimelineOverlay | null,
): BroadsetDocument {
  if (overlay === null) {
    return document;
  }

  const propertiesByElementId = new Map<string, Readonly<Record<string, unknown>>>();

  collectTimelineFrameProperties(propertiesByElementId, overlay.elementId, overlay.frame);

  const elements: BroadsetElement[] = [];
  let didChange = false;

  for (const element of document.elements) {
    const properties = propertiesByElementId.get(element.id);

    if (properties === undefined) {
      elements.push(element);
      continue;
    }

    const patch = composeElementPatch(element, properties);

    if (!hasPatch(patch)) {
      elements.push(element);
      continue;
    }

    didChange = true;
    elements.push(applyPatchToElement(element, patch));
  }

  return didChange ? { ...document, elements } : document;
}

function collectTimelineFrameProperties(
  propertiesByElementId: Map<string, Readonly<Record<string, unknown>>>,
  elementId: string,
  frame: TimelineFrame,
): void {
  propertiesByElementId.set(elementId, mergeRuntimeProperties(propertiesByElementId.get(elementId), frame.properties));

  for (const [targetId, properties] of Object.entries(frame.targetProperties)) {
    propertiesByElementId.set(targetId, mergeRuntimeProperties(propertiesByElementId.get(targetId), properties));
  }

  for (const [childElementId, childFrame] of Object.entries(frame.childFrames)) {
    collectTimelineFrameProperties(propertiesByElementId, childElementId, childFrame);
  }
}

function mergeRuntimeProperties(
  current: Readonly<Record<string, unknown>> | undefined,
  next: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return current === undefined ? next : { ...current, ...next };
}
