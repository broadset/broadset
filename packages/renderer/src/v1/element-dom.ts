import type { projectFormatV1 } from '@broadset/model';

import { appearanceToStyle, appearanceWithinOutputBudgetV1 } from './appearance-css';
import { syncAssetPaintLayersV1 } from './asset-paint-dom';
import { appendElementContentV1, createContentTargetV1, disposeContentTargetV1 } from './element-content-dom';
import { gradientToDataAttributeV1 } from './gradient-css';
import type { PhysicalUnitContextV1 } from './physical-units';
import { geometryToBoxStyle } from './transform-css';

type Id = projectFormatV1.Id;
type Swatch = projectFormatV1.Swatch;
type FontFamilyResource = projectFormatV1.FontFamilyResource;

export type ResolvedRenderAssetV1 =
  | { readonly status: 'ready'; readonly url: string }
  | { readonly status: 'missing'; readonly diagnostic: string };

export interface PluginRendererV1 {
  readonly render: (options: {
    readonly element: projectFormatV1.PluginElement;
    readonly document: Document;
  }) => HTMLElement | undefined;
}

export interface PluginRendererIdentityV1 {
  readonly pluginId: string;
  readonly elementType: string;
  readonly schemaVersion: number;
}

export interface RenderClockV1 {
  readonly now: () => Date;
  readonly subscribe?: ((listener: () => void) => () => void) | undefined;
}

/** Collision-safe authorization identity for one exact plugin element schema. */
export function pluginRendererKeyV1(identity: PluginRendererIdentityV1): string {
  return JSON.stringify([identity.pluginId, identity.elementType, identity.schemaVersion]);
}

export interface RenderContextV1 {
  readonly swatches: ReadonlyMap<Id, Swatch>;
  readonly fonts: ReadonlyMap<Id, FontFamilyResource>;
  readonly resolveAsset: (assetId: Id) => ResolvedRenderAssetV1;
  readonly pluginRenderers?: ReadonlyMap<string, PluginRendererV1> | undefined;
  /** Deterministic runtime clock. Realtime clock elements fail soft when it is unavailable. */
  readonly clock?: RenderClockV1 | undefined;
  readonly document?: Document | undefined;
}

export interface ResolvedElementDomOptionsV1 {
  readonly node: projectFormatV1.ResolvedSceneNodeV1;
  readonly context: RenderContextV1;
  readonly units: PhysicalUnitContextV1;
  readonly vectorOperands?: ReadonlyMap<Id, projectFormatV1.VectorElement> | undefined;
  readonly vectorOperandDiagnostic?: string | undefined;
}

const STYLE_PROPERTIES: readonly string[] = [
  'position',
  'left',
  'top',
  'box-sizing',
  'pointer-events',
  'transform-style',
  'width',
  'height',
  'transform',
  'transform-origin',
  'opacity',
  'mix-blend-mode',
  'isolation',
  'filter',
  'backdrop-filter',
  '--broadset-deferred-effects',
  'visibility',
];

function kebab(property: string): string {
  return property.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

export function applyStyleV1(element: HTMLElement, style: Readonly<Record<string, string | undefined>>): void {
  for (const [property, value] of Object.entries(style)) {
    if (value !== undefined) element.style.setProperty(kebab(property), value);
  }
}

function applyAccessibilityV1(
  element: HTMLElement,
  accessibility: projectFormatV1.ElementAccessibility | undefined,
): void {
  element.removeAttribute('role');
  element.removeAttribute('aria-label');
  element.removeAttribute('aria-hidden');
  element.removeAttribute('aria-description');
  if (accessibility === undefined) return;

  if (accessibility.role !== undefined) element.setAttribute('role', accessibility.role);
  if (accessibility.label !== undefined) element.setAttribute('aria-label', accessibility.label);
  if (accessibility.description !== undefined) element.setAttribute('aria-description', accessibility.description);
  if (accessibility.decorative) element.setAttribute('aria-hidden', 'true');
}

function clearHostStyleV1(host: HTMLElement): void {
  STYLE_PROPERTIES.forEach((property) => host.style.removeProperty(property));
}

function firstGradient(element: projectFormatV1.Element): projectFormatV1.Gradient | undefined {
  for (const fill of element.appearance.fills) {
    if (fill.enabled && fill.paint.kind === 'gradient') return fill.paint.gradient;
  }

  return undefined;
}

function applyHostV1(options: ResolvedElementDomOptionsV1, host: HTMLElement): void {
  const { node, context, units } = options;
  const appearance = appearanceToStyle(node.element.appearance, context.swatches, units);

  clearHostStyleV1(host);
  host.dataset['elementId'] = node.element.id;
  host.dataset['instanceRootId'] = node.address.rootInstanceId;
  host.dataset['componentInstancePath'] = JSON.stringify(node.address.componentInstancePath);
  host.dataset['visibility'] = node.visible ? 'onscreen' : 'offscreen';
  host.toggleAttribute('data-opacity-target', true);
  host.classList.toggle('offscreen', !node.visible);
  applyStyleV1(host, {
    position: 'absolute',
    left: '0',
    top: '0',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    transformStyle: 'preserve-3d',
    ...geometryToBoxStyle(node.localGeometry, units),
    opacity: appearance.opacity,
    mixBlendMode: appearance.mixBlendMode,
    isolation: appearance.isolation,
    filter: appearance.filter,
    backdropFilter: appearance.backdropFilter,
    '--broadset-deferred-effects': appearance.deferredEffects,
    visibility: node.visible ? 'visible' : 'hidden',
  });
  applyAccessibilityV1(host, node.element.accessibility);
}

/** Refresh only geometry, visibility, accessibility, and host-level appearance. */
export function updateResolvedElementHostV1(options: ResolvedElementDomOptionsV1, host: HTMLElement): void {
  applyHostV1(options, host);
}

/** Refresh only semantic content and content-level fills. Structural children remain mounted. */
export function updateResolvedElementContentV1(options: ResolvedElementDomOptionsV1, host: HTMLElement): void {
  const content = createContentTargetV1(host, options.node.element, options.context.document ?? globalThis.document);
  const appearance = appearanceToStyle(options.node.element.appearance, options.context.swatches, options.units);
  const gradient = firstGradient(options.node.element);

  host.querySelector(':scope > [data-appearance-budget-fallback]')?.remove();

  if (!appearanceWithinOutputBudgetV1(options.node.element.appearance)) {
    if (content !== host) {
      disposeContentTargetV1(content);
      content.replaceChildren();
    }

    const fallback = (options.context.document ?? globalThis.document).createElement('div');

    fallback.dataset['appearanceBudgetFallback'] = 'true';
    fallback.className = 'broadset-render-fallback';
    fallback.setAttribute('role', 'img');
    fallback.textContent = 'Appearance output budget exceeded';
    content.prepend(fallback);

    return;
  }

  content.style.removeProperty('background-image');
  content.style.removeProperty('background-blend-mode');

  if (appearance.backgroundImage !== undefined)
    content.style.setProperty('background-image', appearance.backgroundImage);

  if (appearance.backgroundBlendMode !== undefined) {
    content.style.setProperty('background-blend-mode', appearance.backgroundBlendMode);
  }

  if (gradient === undefined) content.removeAttribute('data-gradient');
  else content.dataset['gradient'] = gradientToDataAttributeV1(gradient);

  if (content !== host) {
    disposeContentTargetV1(content);
    content.replaceChildren();
    appendElementContentV1({ ...options, content });
  }

  syncAssetPaintLayersV1({
    content,
    appearance: options.node.element.appearance,
    context: options.context,
    units: options.units,
    clipToVector: options.node.element.kind === 'vector',
  });
}

/** Refresh one stable element host from a resolved scene node. Structural children remain mounted. */
function updateResolvedElementV1(options: ResolvedElementDomOptionsV1, host: HTMLElement): void {
  updateResolvedElementHostV1(options, host);
  updateResolvedElementContentV1(options, host);
}

/** Render one resolved v1 scene node to a detached, fail-soft DOM host. */
export function renderResolvedElementV1(options: ResolvedElementDomOptionsV1): HTMLElement {
  const domDocument = options.context.document ?? globalThis.document;
  const host = domDocument.createElement('div');

  try {
    updateResolvedElementV1(options, host);
  } catch {
    applyHostV1(options, host);

    const content = createContentTargetV1(host, options.node.element, domDocument);

    if (content !== host) {
      disposeContentTargetV1(content);
      content.replaceChildren();

      const fallback = domDocument.createElement('div');

      fallback.className = 'broadset-render-fallback';
      fallback.textContent = 'Element preview unavailable';
      content.append(fallback);
    }
  }

  return host;
}
