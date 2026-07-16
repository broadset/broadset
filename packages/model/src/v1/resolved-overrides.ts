import type { Effect, FillLayer, GradientStop, StrokeLayer } from './appearance';
import type { Element, PathPoint } from './element';
import type { PropertyTarget } from './identity';
import { applyResolvedTransformValueV1 } from './resolved-transform-overrides';
import type { TextParagraph, TextRun } from './text';
import type { TypedValue } from './typed-value';

function updateElementCommon(element: Element, pointer: string, value: TypedValue): Element | undefined {
  if (pointer === '/geometry/bounds/width' && value.type === 'length') {
    return {
      ...element,
      geometry: { ...element.geometry, bounds: { ...element.geometry.bounds, width: value.value } },
    };
  }

  if (pointer === '/geometry/bounds/height' && value.type === 'length') {
    return {
      ...element,
      geometry: { ...element.geometry, bounds: { ...element.geometry.bounds, height: value.value } },
    };
  }

  if (pointer === '/geometry/origin' && value.type === 'point3d') {
    return { ...element, geometry: { ...element.geometry, origin: value.value } };
  }

  if (pointer === '/appearance/opacity' && value.type === 'number') {
    return { ...element, appearance: { ...element.appearance, opacity: value.value } };
  }

  if (pointer === '/accessibility/label' && value.type === 'string' && element.accessibility?.label !== undefined) {
    return { ...element, accessibility: { ...element.accessibility, label: value.value } };
  }

  if (
    pointer === '/accessibility/description' &&
    value.type === 'string' &&
    element.accessibility?.description !== undefined
  ) {
    return { ...element, accessibility: { ...element.accessibility, description: value.value } };
  }

  const transform = applyResolvedTransformValueV1(element.geometry.transform, pointer, value);

  return transform === undefined ? undefined : { ...element, geometry: { ...element.geometry, transform } };
}

function updateImage(
  element: Extract<Element, { readonly kind: 'image' }>,
  pointer: string,
  value: TypedValue,
): Element | undefined {
  if (pointer === '/image/assetId' && value.type === 'asset')
    return { ...element, image: { ...element.image, assetId: value.assetId } };
  if (pointer === '/image/focalPoint' && value.type === 'point2d' && element.image.focalPoint !== undefined)
    return { ...element, image: { ...element.image, focalPoint: value.value } };

  return undefined;
}

function updateVideo(
  element: Extract<Element, { readonly kind: 'video' }>,
  pointer: string,
  value: TypedValue,
): Element | undefined {
  if (pointer === '/video/assetId' && value.type === 'asset')
    return { ...element, video: { ...element.video, assetId: value.assetId } };
  if (value.type !== 'boolean') return undefined;
  if (pointer === '/video/autoplay') return { ...element, video: { ...element.video, autoplay: value.value } };
  if (pointer === '/video/loop') return { ...element, video: { ...element.video, loop: value.value } };
  if (pointer === '/video/muted') return { ...element, video: { ...element.video, muted: value.value } };

  return pointer === '/video/controls' ? { ...element, video: { ...element.video, controls: value.value } } : undefined;
}

function updateAudio(
  element: Extract<Element, { readonly kind: 'audio' }>,
  pointer: string,
  value: TypedValue,
): Element | undefined {
  if (pointer === '/audio/assetId' && value.type === 'asset')
    return { ...element, audio: { ...element.audio, assetId: value.assetId } };
  if (pointer === '/audio/autoplay' && value.type === 'boolean')
    return { ...element, audio: { ...element.audio, autoplay: value.value } };
  if (pointer === '/audio/loop' && value.type === 'boolean')
    return { ...element, audio: { ...element.audio, loop: value.value } };

  return pointer === '/audio/volume' && value.type === 'number' ?
      { ...element, audio: { ...element.audio, volume: value.value } }
    : undefined;
}

function updateClock(
  element: Extract<Element, { readonly kind: 'clock' }>,
  pointer: string,
  value: TypedValue,
): Element | undefined {
  if (value.type !== 'string') return undefined;
  if (pointer === '/clock/format') return { ...element, clock: { ...element.clock, format: value.value } };
  if (pointer === '/clock/timeZone') return { ...element, clock: { ...element.clock, timeZone: value.value } };

  return pointer === '/clock/locale' && element.clock.locale !== undefined ?
      { ...element, clock: { ...element.clock, locale: value.value } }
    : undefined;
}

function updateTicker(
  element: Extract<Element, { readonly kind: 'ticker' }>,
  pointer: string,
  value: TypedValue,
): Element | undefined {
  if (
    pointer === '/ticker/direction' &&
    value.type === 'string' &&
    (value.value === 'left' || value.value === 'right' || value.value === 'up' || value.value === 'down')
  )
    return { ...element, ticker: { ...element.ticker, direction: value.value } };
  if (pointer === '/ticker/speed' && value.type === 'number')
    return { ...element, ticker: { ...element.ticker, speed: value.value } };
  if (pointer === '/ticker/gap' && value.type === 'number')
    return { ...element, ticker: { ...element.ticker, gap: value.value } };

  return pointer === '/ticker/repeat' && value.type === 'boolean' ?
      { ...element, ticker: { ...element.ticker, repeat: value.value } }
    : undefined;
}

function updateQrCode(
  element: Extract<Element, { readonly kind: 'qrcode' }>,
  pointer: string,
  value: TypedValue,
): Element | undefined {
  if (pointer === '/qrcode/value' && value.type === 'string')
    return { ...element, qrcode: { ...element.qrcode, value: value.value } };
  if (
    pointer === '/qrcode/errorCorrection' &&
    value.type === 'string' &&
    (value.value === 'L' || value.value === 'M' || value.value === 'Q' || value.value === 'H')
  )
    return { ...element, qrcode: { ...element.qrcode, errorCorrection: value.value } };

  return pointer === '/qrcode/quietZone' && value.type === 'length' ?
      { ...element, qrcode: { ...element.qrcode, quietZone: value.value } }
    : undefined;
}

function updateText(
  element: Extract<Element, { readonly kind: 'text' }>,
  pointer: string,
  value: TypedValue,
): Element | undefined {
  const paddingMatch = /^\/layout\/padding\/([0-3])$/u.exec(pointer);

  if (paddingMatch !== null && value.type === 'length' && element.layout.padding !== undefined) {
    const index = Number(paddingMatch[1]);
    const padding = element.layout.padding;
    const at = (position: number): number => (position === index ? value.value : (padding[position] ?? value.value));

    return { ...element, layout: { ...element.layout, padding: [at(0), at(1), at(2), at(3)] } };
  }

  if (pointer === '/layout/columns' && value.type === 'integer')
    return { ...element, layout: { ...element.layout, columns: value.value } };
  if (pointer === '/layout/columnGap' && value.type === 'length')
    return { ...element, layout: { ...element.layout, columnGap: value.value } };
  if (
    pointer === '/layout/verticalAlignment' &&
    value.type === 'string' &&
    (value.value === 'top' || value.value === 'middle' || value.value === 'bottom')
  )
    return { ...element, layout: { ...element.layout, verticalAlignment: value.value } };
  if (
    pointer === '/layout/overflow' &&
    value.type === 'string' &&
    (value.value === 'clip' || value.value === 'visible' || value.value === 'ellipsis')
  )
    return { ...element, layout: { ...element.layout, overflow: value.value } };
  if (
    pointer === '/layout/autoSize' &&
    value.type === 'string' &&
    (value.value === 'none' || value.value === 'width' || value.value === 'height' || value.value === 'both')
  )
    return { ...element, layout: { ...element.layout, autoSize: value.value } };

  return pointer === '/textPath/startOffset' && value.type === 'length' && element.textPath !== undefined ?
      { ...element, textPath: { ...element.textPath, startOffset: value.value } }
    : undefined;
}

function updateElementVariant(element: Element, pointer: string, value: TypedValue): Element | undefined {
  switch (element.kind) {
    case 'image':
      return updateImage(element, pointer, value);
    case 'video':
      return updateVideo(element, pointer, value);
    case 'audio':
      return updateAudio(element, pointer, value);
    case 'clock':
      return updateClock(element, pointer, value);
    case 'ticker':
      return updateTicker(element, pointer, value);
    case 'qrcode':
      return updateQrCode(element, pointer, value);
    case 'text':
      return updateText(element, pointer, value);
    case 'group':
      return pointer === '/group/clipChildren' && value.type === 'boolean' ?
          { ...element, group: { clipChildren: value.value } }
        : undefined;
    case 'foreign':
      return pointer === '/foreign/previewAssetId' && value.type === 'asset' ?
          { ...element, foreign: { ...element.foreign, previewAssetId: value.assetId } }
        : undefined;
    default:
      return undefined;
  }
}

function updateFill(fill: FillLayer, pointer: string, value: TypedValue): FillLayer | undefined {
  if (pointer === '/enabled' && value.type === 'boolean') return { ...fill, enabled: value.value };
  if (pointer === '/opacity' && value.type === 'number') return { ...fill, opacity: value.value };
  if (pointer === '/paint/color' && value.type === 'color' && fill.paint.kind === 'solid')
    return { ...fill, paint: { ...fill.paint, color: value.value } };
  if (
    pointer === '/paint/assetId' &&
    value.type === 'asset' &&
    (fill.paint.kind === 'picture' || fill.paint.kind === 'pattern')
  )
    return { ...fill, paint: { ...fill.paint, assetId: value.assetId } };

  return undefined;
}

function updateStroke(stroke: StrokeLayer, pointer: string, value: TypedValue): StrokeLayer | undefined {
  if (pointer === '/width' && value.type === 'length') return { ...stroke, width: value.value };
  if (pointer === '/dashOffset' && value.type === 'length') return { ...stroke, dashOffset: value.value };

  const fill = updateFill(stroke, pointer, value);

  return fill === undefined ? undefined : { ...stroke, ...fill };
}

function updateEffectBase(effect: Effect, pointer: string, value: TypedValue): Effect | undefined {
  if (pointer === '/enabled' && value.type === 'boolean') return { ...effect, enabled: value.value };
  if (pointer === '/opacity' && value.type === 'number') return { ...effect, opacity: value.value };

  return undefined;
}

function updateShadow(
  effect: Extract<Effect, { readonly kind: 'drop-shadow' | 'inner-shadow' }>,
  pointer: string,
  value: TypedValue,
): Effect | undefined {
  if (pointer === '/radius' && value.type === 'length') return { ...effect, radius: value.value };
  if (pointer === '/spread' && value.type === 'length') return { ...effect, spread: value.value };
  if (pointer === '/offset' && value.type === 'point2d') return { ...effect, offset: value.value };

  return pointer === '/color' && value.type === 'color' ? { ...effect, color: value.value } : undefined;
}

function updateBevel(
  effect: Extract<Effect, { readonly kind: 'bevel' }>,
  pointer: string,
  value: TypedValue,
): Effect | undefined {
  if (pointer === '/depth' && value.type === 'length') return { ...effect, depth: value.value };
  if (pointer === '/soften' && value.type === 'length') return { ...effect, soften: value.value };
  if (pointer === '/highlightColor' && value.type === 'color') return { ...effect, highlightColor: value.value };
  if (pointer === '/shadowColor' && value.type === 'color') return { ...effect, shadowColor: value.value };
  if (pointer === '/angle' && value.type === 'angle') return { ...effect, angle: value.value };

  return pointer === '/altitude' && value.type === 'angle' ? { ...effect, altitude: value.value } : undefined;
}

function updateRadiusEffect(
  effect: Extract<Effect, { readonly kind: 'blur' | 'backdrop-blur' }>,
  pointer: string,
  value: TypedValue,
): Effect | undefined {
  return pointer === '/radius' && value.type === 'length' ? { ...effect, radius: value.value } : undefined;
}

function updateGlow(
  effect: Extract<Effect, { readonly kind: 'glow' }>,
  pointer: string,
  value: TypedValue,
): Effect | undefined {
  if (pointer === '/radius' && value.type === 'length') return { ...effect, radius: value.value };
  if (pointer === '/spread' && value.type === 'length') return { ...effect, spread: value.value };

  return pointer === '/color' && value.type === 'color' ? { ...effect, color: value.value } : undefined;
}

function updateDisplacement(
  effect: Extract<Effect, { readonly kind: 'displacement' }>,
  pointer: string,
  value: TypedValue,
): Effect | undefined {
  if (pointer === '/scale' && value.type === 'point2d') return { ...effect, scale: value.value };

  return pointer === '/assetId' && value.type === 'asset' ? { ...effect, assetId: value.assetId } : undefined;
}

function updateEffect(effect: Effect, pointer: string, value: TypedValue): Effect | undefined {
  const base = updateEffectBase(effect, pointer, value);

  if (base !== undefined) return base;

  switch (effect.kind) {
    case 'blur':
    case 'backdrop-blur':
      return updateRadiusEffect(effect, pointer, value);
    case 'drop-shadow':
    case 'inner-shadow':
      return updateShadow(effect, pointer, value);
    case 'glow':
      return updateGlow(effect, pointer, value);
    case 'bevel':
      return updateBevel(effect, pointer, value);
    case 'displacement':
      return updateDisplacement(effect, pointer, value);
    case 'opacity':
      return pointer === '/amount' && value.type === 'number' ? { ...effect, amount: value.value } : undefined;
    case 'color-matrix':
      return undefined;
  }
}

function updateGradientStop(stop: GradientStop, pointer: string, value: TypedValue): GradientStop | undefined {
  if (pointer === '/color' && value.type === 'color') return { ...stop, color: value.value };
  if (pointer === '/opacity' && value.type === 'number') return { ...stop, opacity: value.value };
  if (pointer === '/offset' && value.type === 'number') return { ...stop, offset: value.value };
  if (pointer === '/midpoint' && value.type === 'number' && stop.midpoint !== undefined)
    return { ...stop, midpoint: value.value };

  return undefined;
}

function updateRun(run: TextRun, pointer: string, value: TypedValue): TextRun | undefined {
  if (pointer === '/text' && value.type === 'string') return { ...run, text: value.value };
  if (pointer === '/properties/size' && value.type === 'length')
    return { ...run, properties: { ...run.properties, size: value.value } };
  if (pointer === '/properties/color' && value.type === 'color')
    return { ...run, properties: { ...run.properties, color: value.value } };
  if (pointer === '/properties/weight' && value.type === 'integer')
    return { ...run, properties: { ...run.properties, weight: value.value } };
  if (pointer === '/properties/baselineShift' && value.type === 'length')
    return { ...run, properties: { ...run.properties, baselineShift: value.value } };
  if (pointer === '/properties/tracking' && value.type === 'number')
    return { ...run, properties: { ...run.properties, tracking: value.value } };
  if (pointer === '/properties/hyperlink' && value.type === 'string' && run.properties.hyperlink !== undefined)
    return { ...run, properties: { ...run.properties, hyperlink: value.value } };

  return undefined;
}

function updateParagraphString(paragraph: TextParagraph, key: string, value: string): TextParagraph | undefined {
  const properties = paragraph.properties;

  if (key === 'alignment' && (value === 'start' || value === 'center' || value === 'end' || value === 'justify'))
    return { ...paragraph, properties: { ...properties, alignment: value } };
  if (key === 'direction' && (value === 'ltr' || value === 'rtl'))
    return { ...paragraph, properties: { ...properties, direction: value } };

  return key === 'hyphenation' && (value === 'none' || value === 'manual' || value === 'auto') ?
      { ...paragraph, properties: { ...properties, hyphenation: value } }
    : undefined;
}

function updateParagraphLength(paragraph: TextParagraph, key: string, value: number): TextParagraph | undefined {
  const properties = paragraph.properties;

  if (key === 'spaceBefore') return { ...paragraph, properties: { ...properties, spaceBefore: value } };
  if (key === 'spaceAfter') return { ...paragraph, properties: { ...properties, spaceAfter: value } };
  if (key === 'firstLineIndent') return { ...paragraph, properties: { ...properties, firstLineIndent: value } };
  if (key === 'startIndent') return { ...paragraph, properties: { ...properties, startIndent: value } };

  return key === 'endIndent' ? { ...paragraph, properties: { ...properties, endIndent: value } } : undefined;
}

function updateParagraphBoolean(paragraph: TextParagraph, key: string, value: boolean): TextParagraph | undefined {
  const properties = paragraph.properties;

  if (key === 'keepTogether') return { ...paragraph, properties: { ...properties, keepTogether: value } };
  if (key === 'keepWithNext') return { ...paragraph, properties: { ...properties, keepWithNext: value } };

  return key === 'widowControl' ? { ...paragraph, properties: { ...properties, widowControl: value } } : undefined;
}

function updateParagraph(paragraph: TextParagraph, pointer: string, value: TypedValue): TextParagraph | undefined {
  if (!pointer.startsWith('/properties/')) return undefined;

  const key = pointer.slice('/properties/'.length);

  if (value.type === 'string') return updateParagraphString(paragraph, key, value.value);
  if (value.type === 'length') return updateParagraphLength(paragraph, key, value.value);
  if (value.type === 'boolean') return updateParagraphBoolean(paragraph, key, value.value);

  return undefined;
}

function updateFillEntity(element: Element, target: PropertyTarget, value: TypedValue): Element | undefined {
  const fill = element.appearance.fills.find((candidate) => candidate.id === target.entity.entityId);
  const updated = fill === undefined ? undefined : updateFill(fill, target.pointer, value);

  if (updated === undefined) return undefined;

  const fills = element.appearance.fills.map((candidate) => (candidate.id === updated.id ? updated : candidate));

  return { ...element, appearance: { ...element.appearance, fills } };
}

function updateStrokeEntity(element: Element, target: PropertyTarget, value: TypedValue): Element | undefined {
  const stroke = element.appearance.strokes.find((candidate) => candidate.id === target.entity.entityId);
  const updated = stroke === undefined ? undefined : updateStroke(stroke, target.pointer, value);

  if (updated === undefined) return undefined;

  const strokes = element.appearance.strokes.map((candidate) => (candidate.id === updated.id ? updated : candidate));

  return { ...element, appearance: { ...element.appearance, strokes } };
}

function updateEffectEntity(element: Element, target: PropertyTarget, value: TypedValue): Element | undefined {
  const effect = element.appearance.effects.find((candidate) => candidate.id === target.entity.entityId);
  const updated = effect === undefined ? undefined : updateEffect(effect, target.pointer, value);

  if (updated === undefined) return undefined;

  const effects = element.appearance.effects.map((candidate) => (candidate.id === updated.id ? updated : candidate));

  return { ...element, appearance: { ...element.appearance, effects } };
}

function updateGradientLayer(layer: FillLayer, target: PropertyTarget, value: TypedValue): FillLayer | undefined {
  if (layer.paint.kind !== 'gradient') return undefined;

  const stop = layer.paint.gradient.stops.find((candidate) => candidate.id === target.entity.entityId);
  const updated = stop === undefined ? undefined : updateGradientStop(stop, target.pointer, value);

  if (updated === undefined) return undefined;

  const stops = layer.paint.gradient.stops.map((candidate) => (candidate.id === updated.id ? updated : candidate));

  return { ...layer, paint: { ...layer.paint, gradient: { ...layer.paint.gradient, stops } } };
}

function updateGradientStopEntity(element: Element, target: PropertyTarget, value: TypedValue): Element | undefined {
  const fill = element.appearance.fills.find(
    (candidate) => updateGradientLayer(candidate, target, value) !== undefined,
  );
  const stroke = element.appearance.strokes.find(
    (candidate) => updateGradientLayer(candidate, target, value) !== undefined,
  );

  if (fill !== undefined) {
    const updated = updateGradientLayer(fill, target, value);
    const fills = element.appearance.fills.map((candidate) =>
      candidate.id === fill.id && updated !== undefined ? updated : candidate,
    );

    return { ...element, appearance: { ...element.appearance, fills } };
  }

  if (stroke === undefined) return undefined;

  const updated = updateGradientLayer(stroke, target, value);
  const strokes = element.appearance.strokes.map((candidate) =>
    candidate.id === stroke.id && updated !== undefined ? { ...candidate, ...updated } : candidate,
  );

  return { ...element, appearance: { ...element.appearance, strokes } };
}

function updatePathPointEntity(element: Element, target: PropertyTarget, value: TypedValue): Element | undefined {
  if (element.kind !== 'vector' || element.geometryData.kind !== 'path') return undefined;

  const updatePoint = (point: PathPoint): PathPoint | undefined => {
    if (point.id !== target.entity.entityId || value.type !== 'length') return undefined;
    if (target.pointer === '/x') return { ...point, x: value.value };

    return target.pointer === '/y' ? { ...point, y: value.value } : undefined;
  };
  const point = element.geometryData.path.points.find((candidate) => updatePoint(candidate) !== undefined);

  if (point === undefined) return undefined;

  const updated = updatePoint(point);
  const points = element.geometryData.path.points.map((candidate) =>
    candidate.id === point.id && updated !== undefined ? updated : candidate,
  );

  return { ...element, geometryData: { ...element.geometryData, path: { ...element.geometryData.path, points } } };
}

function updateTextEntity(element: Element, target: PropertyTarget, value: TypedValue): Element | undefined {
  if (element.kind !== 'text') return undefined;

  if (target.entity.entityKind === 'paragraph') {
    const paragraph = element.text.paragraphs.find((candidate) => candidate.id === target.entity.entityId);
    const updated = paragraph === undefined ? undefined : updateParagraph(paragraph, target.pointer, value);

    if (updated === undefined) return undefined;

    const paragraphs = element.text.paragraphs.map((candidate) => (candidate.id === updated.id ? updated : candidate));

    return { ...element, text: { ...element.text, paragraphs } };
  }

  for (const paragraph of element.text.paragraphs) {
    const run = paragraph.runs.find((candidate) => candidate.id === target.entity.entityId);
    const updated = run === undefined ? undefined : updateRun(run, target.pointer, value);

    if (updated === undefined) continue;

    const runs = paragraph.runs.map((candidate) => (candidate.id === updated.id ? updated : candidate));
    const paragraphs = element.text.paragraphs.map((candidate) =>
      candidate.id === paragraph.id ? { ...candidate, runs } : candidate,
    );

    return { ...element, text: { ...element.text, paragraphs } };
  }

  return undefined;
}

function updateNestedElement(element: Element, target: PropertyTarget, value: TypedValue): Element | undefined {
  switch (target.entity.entityKind) {
    case 'fill':
      return updateFillEntity(element, target, value);
    case 'stroke':
      return updateStrokeEntity(element, target, value);
    case 'effect':
      return updateEffectEntity(element, target, value);
    case 'gradient-stop':
      return updateGradientStopEntity(element, target, value);
    case 'path-point':
      return updatePathPointEntity(element, target, value);
    case 'paragraph':
    case 'text-run':
      return updateTextEntity(element, target, value);
    default:
      return undefined;
  }
}

export function applyResolvedOverrideV1(
  element: Element,
  target: PropertyTarget,
  value: TypedValue,
): Element | undefined {
  if (target.entity.entityKind === 'element') {
    if (target.entity.entityId !== element.id) return undefined;

    return updateElementCommon(element, target.pointer, value) ?? updateElementVariant(element, target.pointer, value);
  }

  return updateNestedElement(element, target, value);
}

export { readResolvedPropertyValueV1 } from './resolved-property-values';
