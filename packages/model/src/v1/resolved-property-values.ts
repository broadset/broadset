import type { Effect, FillLayer, GradientStop, StrokeLayer } from './appearance';
import type { Element, ElementTransform } from './element';
import type { PropertyTarget } from './identity';
import type { TextParagraph, TextRun } from './text';
import type { TypedValue } from './typed-value';

function matrixValueType(transform: ElementTransform, index: number): 'number' | 'length' | undefined {
  if (transform.kind === 'affine2d') {
    if (index >= 0 && index <= 3) return 'number';

    return index === 4 || index === 5 ? 'length' : undefined;
  }

  if (index >= 0 && index <= 11) return 'number';
  if (index >= 12 && index <= 14) return 'length';

  return index === 15 ? 'number' : undefined;
}

function readMatrixPointer(transform: ElementTransform, pointer: string): TypedValue | undefined {
  const prefix = '/geometry/transform/matrix/';

  if (!pointer.startsWith(prefix)) return undefined;

  const indexText = pointer.slice(prefix.length);

  if (!/^\d{1,2}$/u.test(indexText)) return undefined;

  const index = Number(indexText);
  const type = matrixValueType(transform, index);
  const value = transform.matrix[index];

  if (type === undefined || value === undefined) return undefined;

  return type === 'number' ? { type: 'number', value } : { type: 'length', value };
}

function readElementCommon(element: Element, pointer: string): TypedValue | undefined {
  if (pointer === '/geometry/bounds/width') return { type: 'length', value: element.geometry.bounds.width };
  if (pointer === '/geometry/bounds/height') return { type: 'length', value: element.geometry.bounds.height };
  if (pointer === '/geometry/origin') return { type: 'point3d', value: element.geometry.origin };
  if (pointer === '/appearance/opacity') return { type: 'number', value: element.appearance.opacity };
  if (pointer === '/accessibility/label' && element.accessibility?.label !== undefined)
    return { type: 'string', value: element.accessibility.label };
  if (pointer === '/accessibility/description' && element.accessibility?.description !== undefined)
    return { type: 'string', value: element.accessibility.description };

  return readMatrixPointer(element.geometry.transform, pointer);
}

function readVideo(element: Extract<Element, { readonly kind: 'video' }>, pointer: string): TypedValue | undefined {
  if (pointer === '/video/assetId') return { type: 'asset', assetId: element.video.assetId };
  if (pointer === '/video/autoplay') return { type: 'boolean', value: element.video.autoplay };
  if (pointer === '/video/loop') return { type: 'boolean', value: element.video.loop };
  if (pointer === '/video/muted') return { type: 'boolean', value: element.video.muted };

  return pointer === '/video/controls' ? { type: 'boolean', value: element.video.controls } : undefined;
}

function readAudio(element: Extract<Element, { readonly kind: 'audio' }>, pointer: string): TypedValue | undefined {
  if (pointer === '/audio/assetId') return { type: 'asset', assetId: element.audio.assetId };
  if (pointer === '/audio/autoplay') return { type: 'boolean', value: element.audio.autoplay };
  if (pointer === '/audio/loop') return { type: 'boolean', value: element.audio.loop };

  return pointer === '/audio/volume' ? { type: 'number', value: element.audio.volume } : undefined;
}

function readTicker(element: Extract<Element, { readonly kind: 'ticker' }>, pointer: string): TypedValue | undefined {
  if (pointer === '/ticker/direction') return { type: 'string', value: element.ticker.direction };
  if (pointer === '/ticker/speed') return { type: 'number', value: element.ticker.speed };
  if (pointer === '/ticker/gap') return { type: 'number', value: element.ticker.gap };

  return pointer === '/ticker/repeat' ? { type: 'boolean', value: element.ticker.repeat } : undefined;
}

function readText(element: Extract<Element, { readonly kind: 'text' }>, pointer: string): TypedValue | undefined {
  const paddingMatch = /^\/layout\/padding\/([0-3])$/u.exec(pointer);

  if (paddingMatch !== null && element.layout.padding !== undefined) {
    const value = element.layout.padding[Number(paddingMatch[1])];

    return value === undefined ? undefined : { type: 'length', value };
  }

  if (pointer === '/layout/columns') return { type: 'integer', value: element.layout.columns };
  if (pointer === '/layout/columnGap') return { type: 'length', value: element.layout.columnGap };
  if (pointer === '/layout/verticalAlignment') return { type: 'string', value: element.layout.verticalAlignment };
  if (pointer === '/layout/overflow') return { type: 'string', value: element.layout.overflow };
  if (pointer === '/layout/autoSize') return { type: 'string', value: element.layout.autoSize };

  return pointer === '/textPath/startOffset' && element.textPath !== undefined ?
      { type: 'length', value: element.textPath.startOffset }
    : undefined;
}

function readImage(element: Extract<Element, { readonly kind: 'image' }>, pointer: string): TypedValue | undefined {
  if (pointer === '/image/assetId') return { type: 'asset', assetId: element.image.assetId };

  return pointer === '/image/focalPoint' && element.image.focalPoint !== undefined ?
      { type: 'point2d', value: element.image.focalPoint }
    : undefined;
}

function readClock(element: Extract<Element, { readonly kind: 'clock' }>, pointer: string): TypedValue | undefined {
  if (pointer === '/clock/format') return { type: 'string', value: element.clock.format };
  if (pointer === '/clock/timeZone') return { type: 'string', value: element.clock.timeZone };

  return pointer === '/clock/locale' && element.clock.locale !== undefined ?
      { type: 'string', value: element.clock.locale }
    : undefined;
}

function readQrCode(element: Extract<Element, { readonly kind: 'qrcode' }>, pointer: string): TypedValue | undefined {
  if (pointer === '/qrcode/value') return { type: 'string', value: element.qrcode.value };
  if (pointer === '/qrcode/errorCorrection') return { type: 'string', value: element.qrcode.errorCorrection };

  return pointer === '/qrcode/quietZone' ? { type: 'length', value: element.qrcode.quietZone } : undefined;
}

function readElementValue(element: Element, pointer: string): TypedValue | undefined {
  const common = readElementCommon(element, pointer);

  if (common !== undefined) return common;

  switch (element.kind) {
    case 'image':
      return readImage(element, pointer);
    case 'video':
      return readVideo(element, pointer);
    case 'audio':
      return readAudio(element, pointer);
    case 'clock':
      return readClock(element, pointer);
    case 'ticker':
      return readTicker(element, pointer);
    case 'qrcode':
      return readQrCode(element, pointer);
    case 'text':
      return readText(element, pointer);
    case 'group':
      return pointer === '/group/clipChildren' ? { type: 'boolean', value: element.group.clipChildren } : undefined;
    case 'foreign':
      return pointer === '/foreign/previewAssetId' ?
          { type: 'asset', assetId: element.foreign.previewAssetId }
        : undefined;
    default:
      return undefined;
  }
}

function readFillValue(fill: FillLayer, pointer: string): TypedValue | undefined {
  if (pointer === '/enabled') return { type: 'boolean', value: fill.enabled };
  if (pointer === '/opacity') return { type: 'number', value: fill.opacity };
  if (pointer === '/paint/color' && fill.paint.kind === 'solid') return { type: 'color', value: fill.paint.color };
  if (pointer === '/paint/assetId' && (fill.paint.kind === 'picture' || fill.paint.kind === 'pattern'))
    return { type: 'asset', assetId: fill.paint.assetId };

  return undefined;
}

function readStrokeValue(stroke: StrokeLayer, pointer: string): TypedValue | undefined {
  if (pointer === '/width') return { type: 'length', value: stroke.width };
  if (pointer === '/dashOffset') return { type: 'length', value: stroke.dashOffset };

  return readFillValue(stroke, pointer);
}

function readEffectBase(effect: Effect, pointer: string): TypedValue | undefined {
  if (pointer === '/enabled') return { type: 'boolean', value: effect.enabled };
  if (pointer === '/opacity') return { type: 'number', value: effect.opacity };

  return undefined;
}

function readShadow(
  effect: Extract<Effect, { readonly kind: 'drop-shadow' | 'inner-shadow' }>,
  pointer: string,
): TypedValue | undefined {
  if (pointer === '/radius') return { type: 'length', value: effect.radius };
  if (pointer === '/spread') return { type: 'length', value: effect.spread };
  if (pointer === '/offset') return { type: 'point2d', value: effect.offset };

  return pointer === '/color' ? { type: 'color', value: effect.color } : undefined;
}

function readBevel(effect: Extract<Effect, { readonly kind: 'bevel' }>, pointer: string): TypedValue | undefined {
  if (pointer === '/depth') return { type: 'length', value: effect.depth };
  if (pointer === '/soften') return { type: 'length', value: effect.soften };
  if (pointer === '/highlightColor') return { type: 'color', value: effect.highlightColor };
  if (pointer === '/shadowColor') return { type: 'color', value: effect.shadowColor };
  if (pointer === '/angle') return { type: 'angle', value: effect.angle };

  return pointer === '/altitude' ? { type: 'angle', value: effect.altitude } : undefined;
}

function readGlow(effect: Extract<Effect, { readonly kind: 'glow' }>, pointer: string): TypedValue | undefined {
  if (pointer === '/radius') return { type: 'length', value: effect.radius };
  if (pointer === '/spread') return { type: 'length', value: effect.spread };

  return pointer === '/color' ? { type: 'color', value: effect.color } : undefined;
}

function readDisplacement(
  effect: Extract<Effect, { readonly kind: 'displacement' }>,
  pointer: string,
): TypedValue | undefined {
  if (pointer === '/scale') return { type: 'point2d', value: effect.scale };

  return pointer === '/assetId' ? { type: 'asset', assetId: effect.assetId } : undefined;
}

function readEffectValue(effect: Effect, pointer: string): TypedValue | undefined {
  const base = readEffectBase(effect, pointer);

  if (base !== undefined) return base;

  switch (effect.kind) {
    case 'blur':
    case 'backdrop-blur':
      return pointer === '/radius' ? { type: 'length', value: effect.radius } : undefined;
    case 'drop-shadow':
    case 'inner-shadow':
      return readShadow(effect, pointer);
    case 'glow':
      return readGlow(effect, pointer);
    case 'bevel':
      return readBevel(effect, pointer);
    case 'displacement':
      return readDisplacement(effect, pointer);
    case 'opacity':
      return pointer === '/amount' ? { type: 'number', value: effect.amount } : undefined;
    case 'color-matrix':
      return undefined;
  }
}

function readGradientStopValue(stop: GradientStop, pointer: string): TypedValue | undefined {
  if (pointer === '/color') return { type: 'color', value: stop.color };
  if (pointer === '/opacity') return { type: 'number', value: stop.opacity };
  if (pointer === '/offset') return { type: 'number', value: stop.offset };
  if (pointer === '/midpoint' && stop.midpoint !== undefined) return { type: 'number', value: stop.midpoint };

  return undefined;
}

function readRunValue(run: TextRun, pointer: string): TypedValue | undefined {
  if (pointer === '/text') return { type: 'string', value: run.text };
  if (pointer === '/properties/size') return { type: 'length', value: run.properties.size };
  if (pointer === '/properties/color') return { type: 'color', value: run.properties.color };
  if (pointer === '/properties/weight') return { type: 'integer', value: run.properties.weight };
  if (pointer === '/properties/baselineShift') return { type: 'length', value: run.properties.baselineShift };
  if (pointer === '/properties/tracking') return { type: 'number', value: run.properties.tracking };
  if (pointer === '/properties/hyperlink' && run.properties.hyperlink !== undefined)
    return { type: 'string', value: run.properties.hyperlink };

  return undefined;
}

function readParagraphValue(paragraph: TextParagraph, pointer: string): TypedValue | undefined {
  const properties = paragraph.properties;

  if (pointer === '/properties/alignment') return { type: 'string', value: properties.alignment };
  if (pointer === '/properties/direction') return { type: 'string', value: properties.direction };
  if (pointer === '/properties/hyphenation') return { type: 'string', value: properties.hyphenation };
  if (pointer === '/properties/spaceBefore') return { type: 'length', value: properties.spaceBefore };
  if (pointer === '/properties/spaceAfter') return { type: 'length', value: properties.spaceAfter };
  if (pointer === '/properties/firstLineIndent') return { type: 'length', value: properties.firstLineIndent };
  if (pointer === '/properties/startIndent') return { type: 'length', value: properties.startIndent };
  if (pointer === '/properties/endIndent') return { type: 'length', value: properties.endIndent };
  if (pointer === '/properties/keepTogether') return { type: 'boolean', value: properties.keepTogether };
  if (pointer === '/properties/keepWithNext') return { type: 'boolean', value: properties.keepWithNext };
  if (pointer === '/properties/widowControl') return { type: 'boolean', value: properties.widowControl };

  return undefined;
}

function readGradientStopEntity(element: Element, target: PropertyTarget): TypedValue | undefined {
  for (const layer of [...element.appearance.fills, ...element.appearance.strokes]) {
    const stop =
      layer.paint.kind === 'gradient' ?
        layer.paint.gradient.stops.find((candidate) => candidate.id === target.entity.entityId)
      : undefined;

    if (stop !== undefined) return readGradientStopValue(stop, target.pointer);
  }

  return undefined;
}

function readPathPointEntity(element: Element, target: PropertyTarget): TypedValue | undefined {
  if (element.kind !== 'vector' || element.geometryData.kind !== 'path') return undefined;

  const point = element.geometryData.path.points.find((candidate) => candidate.id === target.entity.entityId);

  if (point === undefined) return undefined;
  if (target.pointer === '/x') return { type: 'length', value: point.x };

  return target.pointer === '/y' ? { type: 'length', value: point.y } : undefined;
}

function readTextEntity(element: Element, target: PropertyTarget): TypedValue | undefined {
  if (element.kind !== 'text') return undefined;

  if (target.entity.entityKind === 'paragraph') {
    const paragraph = element.text.paragraphs.find((candidate) => candidate.id === target.entity.entityId);

    return paragraph === undefined ? undefined : readParagraphValue(paragraph, target.pointer);
  }

  for (const paragraph of element.text.paragraphs) {
    const run = paragraph.runs.find((candidate) => candidate.id === target.entity.entityId);

    if (run !== undefined) return readRunValue(run, target.pointer);
  }

  return undefined;
}

function readNestedValue(element: Element, target: PropertyTarget): TypedValue | undefined {
  switch (target.entity.entityKind) {
    case 'fill': {
      const fill = element.appearance.fills.find((candidate) => candidate.id === target.entity.entityId);

      return fill === undefined ? undefined : readFillValue(fill, target.pointer);
    }

    case 'stroke': {
      const stroke = element.appearance.strokes.find((candidate) => candidate.id === target.entity.entityId);

      return stroke === undefined ? undefined : readStrokeValue(stroke, target.pointer);
    }

    case 'effect': {
      const effect = element.appearance.effects.find((candidate) => candidate.id === target.entity.entityId);

      return effect === undefined ? undefined : readEffectValue(effect, target.pointer);
    }

    case 'gradient-stop':
      return readGradientStopEntity(element, target);
    case 'path-point':
      return readPathPointEntity(element, target);
    case 'paragraph':
    case 'text-run':
      return readTextEntity(element, target);
    default:
      return undefined;
  }
}

export function readResolvedPropertyValueV1(element: Element, target: PropertyTarget): TypedValue | undefined {
  if (target.entity.entityKind === 'element' && target.entity.entityId === element.id)
    return readElementValue(element, target.pointer);

  return readNestedValue(element, target);
}
