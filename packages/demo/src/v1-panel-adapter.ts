import { getEditorElementRectV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { colorValueToCss, gradientToCss } from '@broadset/renderer';
import type { PanelElement } from '@broadset/ui';

import { readV1TransformAxes } from './v1-transform-axes';

type SwatchMap = ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch>;

function getPanelType(element: projectFormatV1.Element): string {
  if (element.kind !== 'vector') return element.kind;

  switch (element.geometryData.kind) {
    case 'rectangle':
      return 'rectangle';
    case 'ellipse':
      return 'ellipse';
    case 'path':
    case 'boolean':
      return 'path';
  }
}

function getTextContent(element: projectFormatV1.Element): string {
  switch (element.kind) {
    case 'text':
      return element.text.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n');
    case 'qrcode':
      return element.qrcode.value;
    case 'ticker':
      return element.ticker.items.map((item) => item.text).join(' • ');
    case 'clock':
      return element.clock.format;
    default:
      return '';
  }
}

function getAssetId(element: projectFormatV1.Element): projectFormatV1.Id | null {
  switch (element.kind) {
    case 'image':
      return element.image.assetId;
    case 'video':
      return element.video.assetId;
    case 'audio':
      return element.audio.assetId;
    case 'foreign':
      return element.foreign.previewAssetId;
    case 'plugin':
      return element.plugin.previewAssetId ?? null;
    default:
      return null;
  }
}

function getSolidPaintColor(paint: projectFormatV1.Paint | undefined, swatches: SwatchMap): string {
  return paint?.kind === 'solid' ? colorValueToCss(paint.color, swatches) : '';
}

function getGradientPaint(paint: projectFormatV1.Paint | undefined, swatches: SwatchMap): string {
  return paint?.kind === 'gradient' ? gradientToCss(paint.gradient, swatches) : '';
}

function getTextAlignment(alignment: projectFormatV1.ParagraphProperties['alignment']): string {
  if (alignment === 'start') return 'left';
  if (alignment === 'end') return 'right';

  return alignment;
}

function getTextProperties(element: projectFormatV1.Element): {
  readonly fontFamilyId: projectFormatV1.Id | undefined;
  readonly fontSize: number;
  readonly fontColor: projectFormatV1.ColorValue;
  readonly fontWeight: number;
  readonly fontStyle: string;
  readonly textAlignment: string;
  readonly verticalAlignment: 'top' | 'middle' | 'bottom';
  readonly letterSpacing: number;
} {
  if (element.kind !== 'text') {
    return {
      fontFamilyId: undefined,
      fontSize: 16,
      fontColor: projectFormatV1.createBlackColorValue(),
      fontWeight: 400,
      fontStyle: 'normal',
      textAlignment: 'left',
      verticalAlignment: 'top',
      letterSpacing: 0,
    };
  }

  const paragraph = element.text.paragraphs[0];
  const run = paragraph?.runs[0];
  const alignment = paragraph?.properties.alignment ?? 'start';

  return {
    fontFamilyId: run?.properties.fontFamilyId,
    fontSize: run?.properties.size ?? 16,
    fontColor: run?.properties.color ?? projectFormatV1.createBlackColorValue(),
    fontWeight: run?.properties.weight ?? 400,
    fontStyle: 'normal',
    textAlignment: getTextAlignment(alignment),
    verticalAlignment: element.layout.verticalAlignment,
    letterSpacing: run?.properties.tracking ?? 0,
  };
}

function getBorderRadius(element: projectFormatV1.Element): readonly [number, number, number, number] {
  return element.kind === 'vector' && element.geometryData.kind === 'rectangle' ?
      element.geometryData.cornerRadii
    : [0, 0, 0, 0];
}

function getObjectFit(element: projectFormatV1.Element): string {
  if (element.kind === 'image') return element.image.fit;
  if (element.kind === 'video') return element.video.fit;

  return 'fill';
}

function getBooleanOperation(element: projectFormatV1.Element): PanelElement['booleanOperation'] {
  return element.kind === 'vector' && element.geometryData.kind === 'boolean' ? element.geometryData.operation : null;
}

export function toPanelElementV1(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly element: projectFormatV1.Element;
}): PanelElement {
  const { project, element } = options;
  const rect = getEditorElementRectV1(element);
  const transformAxes = readV1TransformAxes(element.geometry.transform);
  const swatches = new Map(project.resources.swatches.map((swatch) => [swatch.id, swatch]));
  const fill = element.appearance.fills.find((candidate) => candidate.enabled);
  const stroke = element.appearance.strokes.find((candidate) => candidate.enabled);
  const text = getTextProperties(element);
  const fontFamily = project.resources.fonts.find((candidate) => candidate.id === text.fontFamilyId)?.familyName ?? '';

  return {
    id: element.id,
    type: getPanelType(element),
    name: element.name,
    locked: element.locked,
    content: getTextContent(element),
    assetId: getAssetId(element),
    ...rect,
    backgroundColor: getSolidPaintColor(fill?.paint, swatches),
    backgroundGradient: getGradientPaint(fill?.paint, swatches),
    borderWidth: stroke?.width ?? 0,
    borderColor: getSolidPaintColor(stroke?.paint, swatches),
    borderStyle: stroke === undefined || stroke.dash.length === 0 ? 'solid' : 'dashed',
    borderRadius: getBorderRadius(element),
    opacity: element.appearance.opacity,
    mixBlendMode: element.appearance.blendMode,
    isolation: element.appearance.isolation ? 'isolate' : 'auto',
    boxShadow: '',
    filter: '',
    backdropFilter: '',
    fontFamily,
    fontSize: text.fontSize,
    fontColor: colorValueToCss(text.fontColor, swatches),
    fontWeight: text.fontWeight,
    fontStyle: text.fontStyle,
    textAlignment: text.textAlignment,
    verticalAlignment: text.verticalAlignment,
    textDecoration: 'none',
    textTransform: 'none',
    letterSpacing: text.letterSpacing,
    lineHeight: 'normal',
    wordSpacing: 0,
    textStroke: '',
    textShadow: '',
    writingMode: 'horizontal-tb',
    fontVariationSettings: '',
    padding: element.kind === 'text' ? (element.layout.padding ?? [0, 0, 0, 0]) : [0, 0, 0, 0],
    stroke: getSolidPaintColor(stroke?.paint, swatches),
    strokeWidth: stroke?.width ?? 1,
    strokeDasharray: stroke?.dash.join(' ') ?? '',
    strokeDashoffset: stroke?.dashOffset ?? 0,
    strokeLinecap: stroke?.cap ?? 'butt',
    strokeLinejoin: stroke?.join ?? 'miter',
    strokeOpacity: stroke?.opacity ?? 1,
    fill: getSolidPaintColor(fill?.paint, swatches),
    fillOpacity: fill?.opacity ?? 1,
    fillRule:
      element.kind === 'vector' && element.geometryData.kind === 'path' ? element.geometryData.fillRule : 'nonzero',
    trimStart: 0,
    trimEnd: 1,
    trimOffset: 0,
    maskType: element.appearance.mask?.kind ?? 'none',
    customClipPath: '',
    clipChildren: element.kind === 'group' ? element.group.clipChildren : false,
    rotateX: transformAxes.rotateX,
    rotateY: transformAxes.rotateY,
    rotateZ: transformAxes.rotateZ,
    translateZ: transformAxes.translateZ,
    objectFit: getObjectFit(element),
    autoSize: element.kind === 'text' ? element.layout.autoSize : 'none',
    errorCorrection: element.kind === 'qrcode' ? element.qrcode.errorCorrection : 'M',
    qrForegroundColor: '#000000',
    qrBackgroundColor: '#ffffff',
    ...(element.kind === 'video' ?
      {
        videoAutoplay: element.video.autoplay,
        videoLoop: element.video.loop,
        videoMuted: element.video.muted,
      }
    : {}),
    ...(element.kind === 'ticker' ?
      {
        tickerItems: element.ticker.items.map((item) => item.text),
        tickerSpeed: element.ticker.speed,
        tickerDirection: element.ticker.direction,
        tickerGap: element.ticker.gap,
        tickerPaused: !element.ticker.repeat,
      }
    : {}),
    booleanOperation: getBooleanOperation(element),
  };
}
