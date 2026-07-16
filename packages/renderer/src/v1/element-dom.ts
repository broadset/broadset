import type { projectFormatV1 } from '@broadset/model';

import { appearanceToStyle } from './appearance-css';
import { colorValueToCss, formatCssNumber } from './paint-css';
import { pathToSvgD } from './path-to-svg-d';
import { paragraphToStyle, runToStyle } from './text-css';
import { geometryToBoxStyle } from './transform-css';

type Element = projectFormatV1.Element;
type Id = projectFormatV1.Id;
type Swatch = projectFormatV1.Swatch;
type FontFamilyResource = projectFormatV1.FontFamilyResource;
type VectorElement = projectFormatV1.VectorElement;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const FULL_SIZE = '100%';
const ELLIPSE_BORDER_RADIUS = '50%';
const PIXEL_UNIT = 'px';

export interface RenderContextV1 {
  readonly swatches: ReadonlyMap<Id, Swatch>;
  readonly fonts: ReadonlyMap<Id, FontFamilyResource>;
  readonly resolveAssetUrl: (assetId: Id) => string | undefined;
  readonly document?: Document;
}

function kebab(property: string): string {
  return property.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function applyStyle(element: HTMLElement, style: Readonly<Record<string, string | undefined>>): void {
  for (const [property, value] of Object.entries(style)) {
    if (value !== undefined) element.style.setProperty(kebab(property), value);
  }
}

function applyAccessibility(
  element: HTMLElement,
  accessibility: projectFormatV1.ElementAccessibility | undefined,
): void {
  if (accessibility === undefined) return;

  if (accessibility.role !== undefined) element.setAttribute('role', accessibility.role);
  if (accessibility.label !== undefined) element.setAttribute('aria-label', accessibility.label);
  if (accessibility.decorative) element.setAttribute('aria-hidden', 'true');
}

function rectangleBorderRadius(radii: readonly [number, number, number, number]): string {
  return radii.map((radius) => `${formatCssNumber(radius)}${PIXEL_UNIT}`).join(' ');
}

function firstSolidFillColor(element: VectorElement, swatches: ReadonlyMap<Id, Swatch>): string {
  const fill = element.appearance.fills.find((candidate) => candidate.enabled && candidate.paint.kind === 'solid');

  return fill?.paint.kind === 'solid' ? colorValueToCss(fill.paint.color, swatches) : 'currentColor';
}

function appendPath(options: {
  readonly container: HTMLElement;
  readonly element: VectorElement;
  readonly context: RenderContextV1;
  readonly document: Document;
}): void {
  const { container, element, context, document: domDocument } = options;

  if (element.geometryData.kind !== 'path') return;

  const svg = domDocument.createElementNS(SVG_NAMESPACE, 'svg');
  const path = domDocument.createElementNS(SVG_NAMESPACE, 'path');

  svg.style.setProperty('width', FULL_SIZE);
  svg.style.setProperty('height', FULL_SIZE);
  path.setAttribute('d', pathToSvgD(element.geometryData.path));
  path.setAttribute('fill', firstSolidFillColor(element, context.swatches));
  path.setAttribute('fill-rule', element.geometryData.fillRule);
  svg.append(path);
  container.append(svg);
}

function appendVector(options: {
  readonly container: HTMLElement;
  readonly element: VectorElement;
  readonly context: RenderContextV1;
  readonly document: Document;
}): void {
  const { container, element } = options;

  switch (element.geometryData.kind) {
    case 'rectangle':
      container.style.setProperty('border-radius', rectangleBorderRadius(element.geometryData.cornerRadii));

      return;
    case 'ellipse':
      container.style.setProperty('border-radius', ELLIPSE_BORDER_RADIUS);

      return;
    case 'path':
      // The shape carries the fill on the SVG path, so the box must not also paint the fill as a
      // rectangular background (appearance fills applied a background-image to the container).
      container.style.removeProperty('background-image');
      appendPath(options);

      return;
    case 'boolean':
      // Boolean geometry composition is added by a later renderer slice; the sized container is inert for
      // now, and the fill belongs to the (future) composed shape rather than the rectangular box.
      container.style.removeProperty('background-image');

      return;
  }
}

function appendText(options: {
  readonly container: HTMLElement;
  readonly element: projectFormatV1.TextElement;
  readonly context: RenderContextV1;
  readonly document: Document;
}): void {
  const { container, element, context, document: domDocument } = options;

  for (const paragraph of element.text.paragraphs) {
    const paragraphNode = domDocument.createElement('div');

    applyStyle(paragraphNode, { ...paragraphToStyle(paragraph.properties) });

    for (const run of paragraph.runs) {
      const span = domDocument.createElement('span');

      applyStyle(span, { ...runToStyle(run.properties, context.fonts, context.swatches) });
      span.textContent = run.text;
      paragraphNode.append(span);
    }

    container.append(paragraphNode);
  }
}

function appendImage(options: {
  readonly container: HTMLElement;
  readonly element: projectFormatV1.ImageElement;
  readonly context: RenderContextV1;
  readonly document: Document;
}): void {
  const { container, element, context, document: domDocument } = options;
  const image = domDocument.createElement('img');
  const assetUrl = context.resolveAssetUrl(element.image.assetId);

  if (assetUrl !== undefined) image.src = assetUrl;

  image.alt = element.accessibility?.label ?? '';
  image.style.setProperty('object-fit', element.image.fit);
  image.style.setProperty('width', FULL_SIZE);
  image.style.setProperty('height', FULL_SIZE);
  container.append(image);
}

function appendClock(container: HTMLElement, element: projectFormatV1.ClockElement, domDocument: Document): void {
  const span = domDocument.createElement('span');

  // This renderer is static; playback owns replacing the format token with live clock values.
  span.textContent = element.clock.format;
  container.append(span);
}

function appendElementContent(options: {
  readonly container: HTMLElement;
  readonly element: Element;
  readonly context: RenderContextV1;
  readonly document: Document;
}): void {
  const { container, element, document: domDocument } = options;

  switch (element.kind) {
    case 'text':
      appendText({ ...options, element });

      return;
    case 'image':
      appendImage({ ...options, element });

      return;
    case 'vector':
      appendVector({ ...options, element });

      return;
    case 'clock':
      appendClock(container, element, domDocument);

      return;
    case 'group':
    case 'component-instance':
      return;
    case 'qrcode':
    case 'ticker':
    case 'video':
    case 'audio':
    case 'foreign':
    case 'plugin':
      // Full content renderers for these kinds are intentionally deferred to later slice-C work.
      container.dataset['elementKind'] = element.kind;

      return;
  }
}

/** Render one v1 element to a detached DOM node; scene hierarchy and live playback are resolved elsewhere. */
export function renderElementV1(element: Element, context: RenderContextV1): HTMLElement {
  const domDocument = context.document ?? globalThis.document;
  const container = domDocument.createElement('div');

  container.dataset['elementId'] = element.id;
  applyStyle(container, {
    position: 'absolute',
    boxSizing: 'border-box',
    ...geometryToBoxStyle(element.geometry),
    ...appearanceToStyle(element.appearance, context.swatches),
  });
  applyAccessibility(container, element.accessibility);
  appendElementContent({ container, element, context, document: domDocument });

  return container;
}
