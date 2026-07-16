import type { projectFormatV1 } from '@broadset/model';

import { appearanceWithinOutputBudgetV1, paintToBackgroundLayerV1 } from './appearance-css';
import type { RenderContextV1 } from './element-dom';
import { formatCssNumber } from './paint-css';
import { type PhysicalUnitContextV1, spatialValueToCssPixelsV1 } from './physical-units';
import { createSvgDefinitionIdFactoryV1 } from './svg-definition-ids';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function assetUrl(context: RenderContextV1, assetId: projectFormatV1.Id): string | undefined {
  try {
    const result = context.resolveAsset(assetId);

    return result.status === 'ready' && result.url.length > 0 ? result.url : undefined;
  } catch {
    return undefined;
  }
}

function applyPicture(layer: HTMLElement, paint: Extract<projectFormatV1.Paint, { readonly kind: 'picture' }>): void {
  layer.style.setProperty('background-repeat', 'no-repeat');
  layer.style.setProperty('background-position', 'center');

  let backgroundSize: string = paint.fit;

  if (paint.fit === 'fill') backgroundSize = '100% 100%';
  else if (paint.fit === 'none') backgroundSize = 'auto';
  layer.style.setProperty('background-size', backgroundSize);
  if (paint.crop === undefined) return;
  layer.style.setProperty(
    'background-size',
    `${formatCssNumber(100 / paint.crop.width)}% ${formatCssNumber(100 / paint.crop.height)}%`,
  );
  layer.style.setProperty(
    'background-position',
    `${formatCssNumber((paint.crop.width === 1 ? 0 : paint.crop.x / (1 - paint.crop.width)) * 100)}% ${formatCssNumber((paint.crop.height === 1 ? 0 : paint.crop.y / (1 - paint.crop.height)) * 100)}%`,
  );
  layer.dataset['paintCrop'] = JSON.stringify(paint.crop);
}

function applyPattern(
  layer: HTMLElement,
  paint: Extract<projectFormatV1.Paint, { readonly kind: 'pattern' }>,
  units: PhysicalUnitContextV1,
  url: string,
): void {
  const [a, b, c, d, x, y] = paint.transform.matrix;
  const matrix = [a, b, c, d, spatialValueToCssPixelsV1(x, units), spatialValueToCssPixelsV1(y, units)];
  const document = layer.ownerDocument;
  const definitionId = createSvgDefinitionIdFactoryV1(document);
  const patternId = definitionId('pattern');
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const definitions = document.createElementNS(SVG_NAMESPACE, 'defs');
  const pattern = document.createElementNS(SVG_NAMESPACE, 'pattern');
  const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
  const mirror = paint.repeat === 'mirror';
  const transforms =
    mirror ?
      ['translate(0 0)', 'translate(2 0) scale(-1 1)', 'translate(0 2) scale(1 -1)', 'translate(2 2) scale(-1 -1)']
    : ['translate(0 0)'];

  layer.dataset['patternRepeat'] = paint.repeat;
  layer.style.removeProperty('background-image');
  svg.dataset['patternMirror'] = mirror ? 'true' : 'false';
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  pattern.id = patternId;
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('width', patternTileExtent(paint.repeat, 'x'));
  pattern.setAttribute('height', patternTileExtent(paint.repeat, 'y'));
  pattern.setAttribute('patternTransform', `matrix(${matrix.map(formatCssNumber).join(' ')})`);

  const showAssetFallback = (): void => {
    layer.className = 'broadset-render-fallback';
    layer.setAttribute('role', 'img');
    layer.replaceChildren('Pattern asset failed to load');
  };

  for (const transform of transforms) {
    const image = document.createElementNS(SVG_NAMESPACE, 'image');

    image.setAttribute('href', url);
    image.setAttribute('width', '1');
    image.setAttribute('height', '1');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('transform', transform);
    image.addEventListener('error', showAssetFallback, { once: true });
    pattern.appendChild(image);
  }

  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('fill', `url(#${patternId})`);
  definitions.appendChild(pattern);
  svg.appendChild(definitions);
  svg.appendChild(rect);
  layer.appendChild(svg);
}

function patternTileExtent(repeat: projectFormatV1.PatternRepeat, axis: 'x' | 'y'): string {
  if (repeat === 'mirror') return '2';
  if (repeat === 'no-repeat') return '100%';
  if (axis === 'x' && repeat === 'repeat-y') return '100%';
  if (axis === 'y' && repeat === 'repeat-x') return '100%';

  return '1';
}

/** Synchronize ordered asset-backed fill layers without interpreting asset bytes or URLs as markup. */
export function syncAssetPaintLayersV1(options: {
  readonly content: HTMLElement;
  readonly appearance: projectFormatV1.Appearance;
  readonly context: RenderContextV1;
  readonly units: PhysicalUnitContextV1;
  readonly clipToVector: boolean;
}): void {
  options.content.querySelectorAll(':scope > [data-paint-layer]').forEach((layer) => {
    layer.remove();
  });

  const vectorPaint = options.clipToVector ? options.content.querySelector<HTMLElement>('foreignObject > div') : null;
  const target = vectorPaint ?? options.content;

  target.querySelectorAll(':scope > [data-paint-layer]').forEach((layer) => {
    layer.remove();
  });
  target.style.setProperty('position', 'relative');
  target.style.removeProperty('background-image');
  target.style.removeProperty('background-blend-mode');
  if (!appearanceWithinOutputBudgetV1(options.appearance)) return;

  const fragment = options.context.document?.createDocumentFragment() ?? globalThis.document.createDocumentFragment();

  options.appearance.fills.forEach((fill) => {
    if (!fill.enabled || fill.paint.kind === 'none') return;

    const domDocument = options.context.document ?? globalThis.document;
    const layer = domDocument.createElement('div');

    layer.dataset['paintLayer'] = fill.id;
    layer.style.setProperty('position', 'absolute');
    layer.style.setProperty('inset', '0');
    layer.style.setProperty('mix-blend-mode', fill.blendMode);
    layer.style.setProperty('pointer-events', 'none');

    if (fill.paint.kind === 'solid' || fill.paint.kind === 'gradient') {
      const background = paintToBackgroundLayerV1(fill.paint, options.context.swatches, fill.opacity);

      if (background !== undefined) layer.style.setProperty('background-image', background);
    } else {
      const url = assetUrl(options.context, fill.paint.assetId);

      layer.style.setProperty('opacity', formatCssNumber(fill.opacity));

      if (url === undefined) {
        layer.className = 'broadset-render-fallback';
        layer.setAttribute('role', 'img');
        layer.textContent = 'Paint asset missing';
      } else {
        if (fill.paint.kind === 'picture') {
          layer.style.setProperty('background-image', `url(${JSON.stringify(url)})`);
          applyPicture(layer, fill.paint);
        } else applyPattern(layer, fill.paint, options.units, url);
      }
    }

    fragment.append(layer);
  });
  target.prepend(fragment);
}
