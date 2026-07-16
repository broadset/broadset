import type { projectFormatV1 } from '@broadset/model';

import { appearanceWithinOutputBudgetV1, paintToBackgroundLayerV1 } from './appearance-css';
import { syncAssetPaintLayersV1 } from './asset-paint-dom';
import { disposeElementContentV1 } from './element-content-dom';
import {
  type RenderContextV1,
  renderResolvedElementV1,
  updateResolvedElementContentV1,
  updateResolvedElementHostV1,
} from './element-dom';
import { colorValueToCss } from './paint-css';
import { type PhysicalUnitContextV1, spatialValueToCssPixelsV1 } from './physical-units';
import { sceneInstanceKeyV1 } from './scene-instance-key';
import { BOOLEAN_OPERAND_BUDGET_V1 } from './vector-svg';

interface MountedSceneNodeV1 {
  readonly host: HTMLElement;
  readonly signature: string;
  hostFingerprint: string;
  contentFingerprint: string;
}

type SurfaceUnitsV1 = PhysicalUnitContextV1;

interface ReconcileNodeOptionsV1 {
  readonly node: projectFormatV1.ResolvedSceneNodeV1;
  readonly pageId: projectFormatV1.Id;
  readonly context: RenderContextV1;
  readonly previousContext: RenderContextV1;
  readonly units: SurfaceUnitsV1;
  readonly mounted: Map<string, MountedSceneNodeV1>;
  readonly vectorNodes: ReadonlyMap<string, projectFormatV1.VectorElement>;
}

export interface ResolvedSceneDomV1 {
  readonly root: HTMLElement;
  readonly update: (snapshot: projectFormatV1.ResolvedSceneSnapshotV1, context: RenderContextV1) => void;
  readonly destroy: () => void;
}

function mountSignature(node: projectFormatV1.ResolvedSceneNodeV1): string {
  return node.element.kind === 'vector' ? `${node.element.kind}:${node.element.geometryData.kind}` : node.element.kind;
}

function hostFingerprint(node: projectFormatV1.ResolvedSceneNodeV1, units: SurfaceUnitsV1): string {
  return JSON.stringify({
    units,
    localGeometry: node.localGeometry,
    visible: node.visible,
    appearance:
      appearanceWithinOutputBudgetV1(node.element.appearance) ? node.element.appearance : 'output-budget-exceeded',
    accessibility: node.element.accessibility,
    fallbacks: node.fallbacks,
  });
}

function contentFingerprint(
  element: projectFormatV1.Element,
  units: SurfaceUnitsV1,
  vectorOperands: ReadonlyMap<projectFormatV1.Id, projectFormatV1.VectorElement>,
  vectorOperandDiagnostic: string | undefined,
): string {
  const appearance = appearanceWithinOutputBudgetV1(element.appearance);
  const common = {
    units,
    kind: element.kind,
    fills: appearance ? element.appearance.fills : 'output-budget-exceeded',
    strokes: appearance ? element.appearance.strokes : 'output-budget-exceeded',
    accessibility: element.accessibility,
  };

  switch (element.kind) {
    case 'text':
      return JSON.stringify({ ...common, text: element.text, layout: element.layout, textPath: element.textPath });
    case 'image':
      return JSON.stringify({ ...common, image: element.image });
    case 'vector':
      return JSON.stringify({
        ...common,
        geometryData:
          element.geometryData.kind === 'boolean' && vectorOperandDiagnostic !== undefined ?
            {
              kind: element.geometryData.kind,
              operation: element.geometryData.operation,
              status: vectorOperandDiagnostic,
            }
          : element.geometryData,
        operands: element.geometryData.kind === 'boolean' ? [...vectorOperands.entries()] : undefined,
        vectorOperandDiagnostic,
      });
    case 'group':
      return JSON.stringify(common);
    case 'component-instance':
      return JSON.stringify(common);
    case 'video':
      return JSON.stringify({ ...common, video: element.video });
    case 'audio':
      return JSON.stringify({ ...common, audio: element.audio });
    case 'clock':
      return JSON.stringify({ ...common, clock: element.clock });
    case 'ticker':
      return JSON.stringify({ ...common, ticker: element.ticker });
    case 'qrcode':
      return JSON.stringify({ ...common, qrcode: element.qrcode });
    case 'foreign':
      return JSON.stringify({ ...common, foreign: element.foreign });
    case 'plugin':
      return JSON.stringify({ ...common, plugin: element.plugin });
  }
}

function hostContextChanged(previous: RenderContextV1, next: RenderContextV1): boolean {
  return previous.swatches !== next.swatches;
}

function contentContextChanged(
  element: projectFormatV1.Element,
  previous: RenderContextV1,
  next: RenderContextV1,
): boolean {
  if (previous.swatches !== next.swatches) return true;
  if (
    previous.resolveAsset !== next.resolveAsset &&
    [...element.appearance.fills, ...element.appearance.strokes].some(
      (layer) => layer.paint.kind === 'picture' || layer.paint.kind === 'pattern',
    )
  )
    return true;
  if (element.kind === 'text' && previous.fonts !== next.fonts) return true;
  if (element.kind === 'clock' && previous.clock !== next.clock) return true;
  if (
    (element.kind === 'image' || element.kind === 'video' || element.kind === 'audio' || element.kind === 'foreign') &&
    previous.resolveAsset !== next.resolveAsset
  )
    return true;

  return (
    element.kind === 'plugin' &&
    (previous.resolveAsset !== next.resolveAsset || previous.pluginRenderers !== next.pluginRenderers)
  );
}

function positionNode(host: HTMLElement, parent: HTMLElement, previousSibling: HTMLElement | null): void {
  const expected = previousSibling === null ? parent.firstElementChild : previousSibling.nextElementSibling;

  if (expected !== host) parent.insertBefore(host, expected);
}

function enqueueBooleanOperands(
  pending: projectFormatV1.Id[],
  operandIds: readonly projectFormatV1.Id[],
  referenceCount: number,
): number | undefined {
  for (const operandId of operandIds) {
    referenceCount += 1;
    if (referenceCount > BOOLEAN_OPERAND_BUDGET_V1) return undefined;
    pending.push(operandId);
  }

  return referenceCount;
}

function vectorOperandsForNode(
  node: projectFormatV1.ResolvedSceneNodeV1,
  pageId: projectFormatV1.Id,
  vectorNodes: ReadonlyMap<string, projectFormatV1.VectorElement>,
): {
  readonly operands: ReadonlyMap<projectFormatV1.Id, projectFormatV1.VectorElement>;
  readonly diagnostic?: string | undefined;
} {
  const operands = new Map<projectFormatV1.Id, projectFormatV1.VectorElement>();

  if (node.element.kind !== 'vector' || node.element.geometryData.kind !== 'boolean') return { operands };

  const pending: projectFormatV1.Id[] = [];

  if (node.element.geometryData.operandIds.length > BOOLEAN_OPERAND_BUDGET_V1)
    return { operands, diagnostic: 'Boolean operand budget exceeded' };

  for (const operandId of node.element.geometryData.operandIds) pending.push(operandId);

  let referenceCount = pending.length;

  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const operandId = pending[cursor];

    if (operandId === undefined || operands.has(operandId)) continue;

    const key = sceneInstanceKeyV1({
      pageId,
      address: { ...node.address, elementId: operandId },
    });
    const operand = vectorNodes.get(key);

    if (operand === undefined) return { operands: new Map(), diagnostic: 'Boolean operand missing' };
    if (operands.size >= BOOLEAN_OPERAND_BUDGET_V1)
      return { operands: new Map(), diagnostic: 'Boolean operand budget exceeded' };

    operands.set(operandId, operand);

    if (operand.geometryData.kind === 'boolean') {
      const nextReferenceCount = enqueueBooleanOperands(pending, operand.geometryData.operandIds, referenceCount);

      if (nextReferenceCount === undefined)
        return { operands: new Map(), diagnostic: 'Boolean operand budget exceeded' };
      referenceCount = nextReferenceCount;
    }
  }

  return { operands };
}

function reconcileNode(options: ReconcileNodeOptionsV1): {
  readonly key: string;
  readonly entry: MountedSceneNodeV1;
} {
  const { node, pageId, context, previousContext, units, mounted, vectorNodes } = options;
  const vectorOperandResult = vectorOperandsForNode(node, pageId, vectorNodes);
  const vectorOperands = vectorOperandResult.operands;
  const vectorOperandDiagnostic = vectorOperandResult.diagnostic;
  const key = sceneInstanceKeyV1({ pageId, address: node.address });
  const signature = mountSignature(node);
  const nextHostFingerprint = hostFingerprint(node, units);
  const nextContentFingerprint = contentFingerprint(node.element, units, vectorOperands, vectorOperandDiagnostic);
  const existing = mounted.get(key);

  if (existing?.signature !== signature) {
    const host = renderResolvedElementV1({ node, context, units, vectorOperands, vectorOperandDiagnostic });
    const entry = {
      host,
      signature,
      hostFingerprint: nextHostFingerprint,
      contentFingerprint: nextContentFingerprint,
    };

    existing?.host.replaceWith(host);
    if (existing !== undefined) disposeElementContentV1(existing.host);
    mounted.set(key, entry);

    return { key, entry };
  }

  if (existing.hostFingerprint !== nextHostFingerprint || hostContextChanged(previousContext, context)) {
    updateResolvedElementHostV1({ node, context, units }, existing.host);
    existing.hostFingerprint = nextHostFingerprint;
  }

  if (
    existing.contentFingerprint !== nextContentFingerprint ||
    contentContextChanged(node.element, previousContext, context)
  ) {
    updateResolvedElementContentV1({ node, context, units, vectorOperands, vectorOperandDiagnostic }, existing.host);
    existing.contentFingerprint = nextContentFingerprint;
  }

  return { key, entry: existing };
}

function configureSceneRoot(
  root: HTMLElement,
  backdrop: HTMLElement,
  sceneRoot: HTMLElement,
  layer: HTMLElement,
  snapshot: projectFormatV1.ResolvedSceneSnapshotV1,
  context: RenderContextV1,
): void {
  const units = { unit: snapshot.surface.unit, dpi: snapshot.surface.dpi };
  const width = spatialValueToCssPixelsV1(snapshot.surface.size[0], units);
  const height = spatialValueToCssPixelsV1(snapshot.surface.size[1], units);

  root.style.setProperty('position', 'relative');
  root.style.setProperty('width', `${String(width)}px`);
  root.style.setProperty('height', `${String(height)}px`);

  backdrop.className = 'broadset-surface-backdrop';
  backdrop.style.removeProperty('background');
  backdrop.style.removeProperty('background-color');

  sceneRoot.dataset['broadsetCanvasRoot'] = 'true';
  sceneRoot.style.setProperty('position', 'absolute');
  sceneRoot.style.setProperty('inset', '0');
  sceneRoot.style.setProperty('transform-style', 'preserve-3d');

  const swatches = new Map(snapshot.resources.swatches.map((swatch) => [swatch.id, swatch]));

  const assetPaint =
    snapshot.surface.background.kind === 'picture' || snapshot.surface.background.kind === 'pattern' ?
      snapshot.surface.background
    : undefined;

  syncAssetPaintLayersV1({
    content: backdrop,
    appearance: {
      opacity: 1,
      blendMode: 'normal',
      isolation: false,
      fills:
        assetPaint === undefined ?
          []
        : [
            {
              id: assetPaint.assetId,
              enabled: true,
              opacity: 1,
              blendMode: 'normal',
              paint: assetPaint,
            },
          ],
      strokes: [],
      effects: [],
    },
    context,
    units,
    clipToVector: false,
  });

  backdrop.style.setProperty('position', 'absolute');
  backdrop.style.setProperty('inset', '0');
  backdrop.style.setProperty('pointer-events', 'none');

  if (snapshot.surface.background.kind === 'solid') {
    backdrop.style.setProperty('background-color', colorValueToCss(snapshot.surface.background.color, swatches));
  } else if (snapshot.surface.background.kind === 'gradient') {
    const background = paintToBackgroundLayerV1(snapshot.surface.background, swatches);

    if (background !== undefined) backdrop.style.setProperty('background', background);
  }

  layer.dataset['broadsetElementLayer'] = 'true';
  layer.style.setProperty('position', 'absolute');
  layer.style.setProperty('inset', '0');
  layer.style.setProperty('transform-style', 'preserve-3d');
}

/** Create a stable scene DOM handle that incrementally reconciles validated resolved snapshots. */
export function createResolvedSceneDomV1(options: {
  readonly snapshot: projectFormatV1.ResolvedSceneSnapshotV1;
  readonly context: RenderContextV1;
}): ResolvedSceneDomV1 {
  const domDocument = options.context.document ?? globalThis.document;
  const root = domDocument.createElement('div');
  const backdrop = domDocument.createElement('div');
  const sceneRoot = domDocument.createElement('div');
  const layer = domDocument.createElement('div');
  const mounted = new Map<string, MountedSceneNodeV1>();
  let pageIdentity = '';
  let currentContext = options.context;
  let destroyed = false;

  sceneRoot.append(layer);
  root.append(backdrop, sceneRoot);

  const update = (snapshot: projectFormatV1.ResolvedSceneSnapshotV1, context: RenderContextV1): void => {
    if (destroyed) return;

    const nextPageIdentity = JSON.stringify([snapshot.projectId, snapshot.documentId, snapshot.pageId]);

    if (nextPageIdentity !== pageIdentity) {
      mounted.forEach((entry) => {
        disposeElementContentV1(entry.host);
      });
      layer.replaceChildren();
      mounted.clear();
      pageIdentity = nextPageIdentity;
    }

    configureSceneRoot(root, backdrop, sceneRoot, layer, snapshot, context);

    const units = { unit: snapshot.surface.unit, dpi: snapshot.surface.dpi };
    const vectorNodes = new Map<string, projectFormatV1.VectorElement>();

    snapshot.nodes.forEach((node) => {
      if (node.element.kind === 'vector')
        vectorNodes.set(sceneInstanceKeyV1({ pageId: snapshot.pageId, address: node.address }), node.element);
    });

    const retained = new Set<string>();
    const lastChild = new Map<HTMLElement, HTMLElement>();

    for (const node of snapshot.nodes) {
      const parentKey =
        node.parentAddress === null ?
          undefined
        : sceneInstanceKeyV1({ pageId: snapshot.pageId, address: node.parentAddress });
      const parent = parentKey === undefined ? layer : (mounted.get(parentKey)?.host ?? layer);
      const { key, entry } = reconcileNode({
        node,
        pageId: snapshot.pageId,
        context,
        previousContext: currentContext,
        units,
        mounted,
        vectorNodes,
      });

      retained.add(key);

      const previousSibling = lastChild.get(parent) ?? null;

      positionNode(entry.host, parent, previousSibling);
      lastChild.set(parent, entry.host);
    }

    mounted.forEach((entry, key) => {
      if (!retained.has(key)) {
        disposeElementContentV1(entry.host);
        entry.host.remove();
        mounted.delete(key);
      }
    });

    currentContext = context;
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    mounted.forEach((entry) => {
      disposeElementContentV1(entry.host);
    });
    mounted.clear();
    root.replaceChildren();
  };

  update(options.snapshot, options.context);

  return { root, update, destroy };
}

/** Render one resolved snapshot as a detached scene root. */
export function renderResolvedSceneV1(
  snapshot: projectFormatV1.ResolvedSceneSnapshotV1,
  context: RenderContextV1,
): HTMLElement {
  const staticContext: RenderContextV1 =
    context.clock === undefined ? context : { ...context, clock: { now: context.clock.now } };

  return createResolvedSceneDomV1({ snapshot, context: staticContext }).root;
}
