import { createEditorStore, type ElementUpdate } from '@broadset/editor';
import {
  type BroadsetDocument,
  createDefaultElement,
  createEmptyBroadsetDocument,
  type ElementAnimationConfig,
  rgbColor,
  solidFill,
} from '@broadset/model';
import type * as PlaybackModule from '@broadset/playback';
import { createPlaybackController, type TimelineFrame } from '@broadset/playback';
import type * as RendererModule from '@broadset/renderer';
import { createScreenRenderer } from '@broadset/renderer';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeTimelineOverlay } from '../preview-runtime-overlay';
import { ScreenPreview } from './screen-preview';

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  clearPlaybackStyles:
    vi.fn<(options?: { readonly shouldClearProperty?: ((propertyName: string) => boolean) | undefined }) => void>(),
  clearRuntimeStyles: vi.fn<(element: HTMLElement, propertyNames: readonly string[]) => void>(),
  destroyPlayback: vi.fn(),
  destroyRenderer: vi.fn(),
  getOverlayRoot: vi.fn(),
  applyRuntimeStyles: vi.fn<(element: HTMLElement, styles: Readonly<Record<string, unknown>>) => void>(),
  pause: vi.fn(),
  play: vi.fn(),
  seek: vi.fn(),
  seekTimeline: vi.fn(),
  setAnimations: vi.fn(),
  stopTimeline: vi.fn(),
  updateDocument: vi.fn<(document: BroadsetDocument) => void>(),
  updateSettings: vi.fn(),
}));

vi.mock('@broadset/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof RendererModule>();

  return {
    ...actual,
    createScreenRenderer: vi.fn((options: { readonly host: HTMLElement }) => ({
      destroy: mocks.destroyRenderer,
      getOverlayRoot: mocks.getOverlayRoot,
      host: options.host,
      updateDocument: (documentData: BroadsetDocument): void => {
        mocks.updateDocument(documentData);

        const currentHosts = new Map(
          Array.from(options.host.querySelectorAll<HTMLElement>('[data-element-id]')).map((elementHost) => [
            elementHost.dataset['elementId'] ?? '',
            elementHost,
          ]),
        );
        const nextHosts = documentData.elements.map((element) => {
          const existingHost = currentHosts.get(element.id);

          if (existingHost !== undefined) {
            return existingHost;
          }

          const elementHost = document.createElement('div');
          const opacityHost = document.createElement('div');
          const contentHost = document.createElement('div');

          elementHost.dataset['elementId'] = element.id;
          opacityHost.dataset['opacityTarget'] = '';
          contentHost.dataset['elementContent'] = '';
          elementHost.append(opacityHost);
          opacityHost.append(contentHost);

          return elementHost;
        });

        options.host.replaceChildren(...nextHosts);
      },
      updateSettings: mocks.updateSettings,
    })),
  };
});

vi.mock('@broadset/playback', async (importOriginal) => {
  const actual = await importOriginal<typeof PlaybackModule>();

  return {
    ...actual,
    createPlaybackController: vi.fn(() => ({
      attach: mocks.attach,
      clearStyles: mocks.clearPlaybackStyles,
      destroy: mocks.destroyPlayback,
      detach: vi.fn(),
      pause: mocks.pause,
      play: mocks.play,
      seek: mocks.seek,
      seekTimeline: mocks.seekTimeline,
      setAnimations: mocks.setAnimations,
      setSpeed: vi.fn(),
      stopTimeline: mocks.stopTimeline,
    })),
    resolveAnimationTargets: vi.fn(() => ({
      applyStyles: mocks.applyRuntimeStyles,
      clear: vi.fn(),
      clearStyles: mocks.clearRuntimeStyles,
      invalidate: vi.fn(),
    })),
  };
});

function createFrame(
  properties: Readonly<Record<string, unknown>>,
  targetProperties: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {},
  extraFrame: Partial<TimelineFrame> = {},
): TimelineFrame {
  return {
    timelineId: 'timeline-1',
    timelineName: 'Timeline 1',
    timeMs: 500,
    durationMs: 1000,
    properties,
    targetProperties,
    activeState: null,
    modifiers: new Set(),
    childFrames: {},
    ...extraFrame,
  };
}

function createPreviewDocument(): BroadsetDocument {
  const element = createDefaultElement('rectangle', {
    id: 'root',
    style: { opacity: 0.8, fill: solidFill(rgbColor('#ff0000')) },
  });

  return {
    ...createEmptyBroadsetDocument(),
    elements: [element],
  };
}

function createStateConfig(stateName: string, modifierName: string): ElementAnimationConfig {
  return {
    timelines: [],
    stateTimelineBindings: [{ stateName, timelineId: 'state-timeline' }],
    modifierTimelineBindings: [{ modifierName, inTimelineId: 'modifier-timeline' }],
    textAnimator: null,
  };
}

function renderPreview(options: {
  readonly documentData: BroadsetDocument;
  readonly isPlaying?: boolean | undefined;
  readonly runtimeOverlay: RuntimeTimelineOverlay | null;
}): ReturnType<typeof render> {
  const noopTransform = (_elementId: string, _updates: ElementUpdate): void => {};
  const isPlaying = options.isPlaying ?? false;

  return render(
    <ScreenPreview
      allElements={options.documentData.elements}
      clipPathEditingElement={null}
      cursor="default"
      documentData={options.documentData}
      editorStore={createEditorStore()}
      isPlaying={isPlaying}
      isTransformWidgetSuppressed
      onPlaybackControllerChange={undefined}
      panX={0}
      panY={0}
      pathEditingElement={null}
      perspective={800}
      resetToken={0}
      runtimeOverlay={options.runtimeOverlay}
      selectedElement={null}
      zoom={1}
      onCanvasClick={vi.fn()}
      onCanvasContextMenu={vi.fn()}
      onCanvasPointerMove={vi.fn()}
      onElementTransformCommit={noopTransform}
      onElementTransformPreview={noopTransform}
      onViewportChange={vi.fn()}
    />,
  );
}

describe('ScreenPreview runtime overlay boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOverlayRoot.mockReturnValue(document.createElement('div'));
  });

  /** @description Timeline preview overlays must repaint through the renderer without using the playback DOM seek path. */
  it('updates the renderer with a composed preview document without seeking playback DOM', () => {
    const createRenderer = vi.mocked(createScreenRenderer);
    const createPlayback = vi.mocked(createPlaybackController);
    const documentData = createPreviewDocument();
    const runtimeOverlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ opacity: 0.2 }),
    };
    const view = renderPreview({ documentData, runtimeOverlay: null });

    view.rerender(
      <ScreenPreview
        allElements={documentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={documentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={runtimeOverlay}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    const lastRenderedDocument = mocks.updateDocument.mock.calls.at(-1)?.[0];

    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(createPlayback).toHaveBeenCalledTimes(1);
    expect(mocks.seekTimeline).not.toHaveBeenCalled();
    expect(lastRenderedDocument?.elements[0]?.style.opacity).toBe(0.2);
  });

  /** @description DOM-only timeline transform properties must use the same playback style resolver as runtime playback and must clear when the runtime overlay is removed. */
  it('applies and clears DOM-only runtime transform styles', () => {
    const documentData = createPreviewDocument();
    const runtimeOverlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ transform: 'rotate(12deg)', scaleX: 1.5 }),
    };
    const view = renderPreview({ documentData, runtimeOverlay: null });

    view.rerender(
      <ScreenPreview
        allElements={documentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={documentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={runtimeOverlay}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    const applyCall = mocks.applyRuntimeStyles.mock.calls.at(-1);

    if (applyCall === undefined) {
      throw new Error('Expected runtime styles to be applied');
    }

    const [appliedElement, appliedStyles] = applyCall;

    expect(appliedElement.dataset['elementId']).toBe('root');
    expect(appliedStyles).toEqual({ transform: 'rotate(12deg)', scaleX: 1.5 });

    view.rerender(
      <ScreenPreview
        allElements={documentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={documentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={null}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    const clearCall = mocks.clearRuntimeStyles.mock.calls.at(-1);

    if (clearCall === undefined) {
      throw new Error('Expected runtime styles to be cleared');
    }

    const [clearedElement, clearedPropertyNames] = clearCall;

    expect(clearedElement.dataset['elementId']).toBe('root');
    expect(clearedPropertyNames).toEqual(['transform', 'scaleX']);
  });

  /** @description Timeline editing overlays take precedence over document playback so scrubbing remains visible and deterministic. */
  it('applies timeline runtime overlay while global playback is active', () => {
    const documentData = createPreviewDocument();
    const runtimeOverlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ opacity: 0.2 }),
    };
    const view = renderPreview({ documentData, isPlaying: true, runtimeOverlay: null });

    mocks.play.mockClear();
    mocks.pause.mockClear();
    mocks.clearPlaybackStyles.mockClear();

    view.rerender(
      <ScreenPreview
        allElements={documentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={documentData}
        editorStore={createEditorStore()}
        isPlaying
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={runtimeOverlay}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    const renderedDocument = mocks.updateDocument.mock.calls.at(-1)?.[0];

    expect(renderedDocument?.elements[0]?.style.opacity).toBe(0.2);
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.pause).toHaveBeenCalled();
    expect(mocks.clearPlaybackStyles).toHaveBeenCalled();

    expect(mocks.clearPlaybackStyles.mock.calls.at(-1)?.[0]).toBeUndefined();
  });

  /** @description Pausing global playback must freeze the current playback frame instead of repainting the base renderer document. */
  it('does not rerender the document when global playback is paused', () => {
    const documentData = createPreviewDocument();
    const view = renderPreview({ documentData, isPlaying: true, runtimeOverlay: null });

    mocks.pause.mockClear();
    mocks.updateDocument.mockClear();

    view.rerender(
      <ScreenPreview
        allElements={documentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={documentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={null}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    expect(mocks.pause).toHaveBeenCalled();
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  /** @description Initial scrub overlays must render immediately without the global playback end-state seek clobbering them. */
  it('does not seek global playback to the end when mounted directly into a runtime overlay', () => {
    const documentData = createPreviewDocument();
    const runtimeOverlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ opacity: 0.2 }),
    };

    renderPreview({ documentData, runtimeOverlay });

    const renderedDocument = mocks.updateDocument.mock.calls.at(-1)?.[0];

    expect(renderedDocument?.elements[0]?.style.opacity).toBe(0.2);
    expect(mocks.seek).not.toHaveBeenCalledWith(Infinity);
  });

  /** @description Initial scrub overlays must apply DOM-only properties immediately, not wait for a later overlay update. */
  it('applies DOM-only runtime styles when mounted directly into a runtime overlay', () => {
    const documentData = createPreviewDocument();
    const runtimeOverlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ scaleX: 1.5 }),
    };

    renderPreview({ documentData, runtimeOverlay });

    const applyCall = mocks.applyRuntimeStyles.mock.calls.at(-1);

    if (applyCall === undefined) {
      throw new Error('Expected DOM-only runtime styles to be applied during mount');
    }

    const [appliedElement, appliedStyles] = applyCall;

    expect(appliedElement.dataset['elementId']).toBe('root');
    expect(appliedStyles).toEqual({ scaleX: 1.5 });
  });

  /** @description Whole backgroundGradient strings also flow through the DOM overlay so CSS color hints render during scrub preview. */
  it('applies whole backgroundGradient runtime styles through the DOM overlay path', () => {
    const documentData = createPreviewDocument();
    const runtimeOverlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ backgroundGradient: 'linear-gradient(90deg, green 0%, 40%, yellow 100%)' }),
    };
    const view = renderPreview({ documentData, runtimeOverlay: null });

    view.rerender(
      <ScreenPreview
        allElements={documentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={documentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={runtimeOverlay}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    const applyCall = mocks.applyRuntimeStyles.mock.calls.at(-1);

    if (applyCall === undefined) {
      throw new Error('Expected backgroundGradient to be applied through DOM runtime styles');
    }

    expect(applyCall[1]).toEqual({ backgroundGradient: 'linear-gradient(90deg, green 0%, 40%, yellow 100%)' });
  });

  /** @description Runtime overlay cleanup must clear state/modifier classes on owner, targeted, and child-frame elements when DOM nodes are preserved incrementally. */
  it('clears targeted and child runtime state classes when timeline preview stops', () => {
    const root = createDefaultElement('rectangle', { id: 'root' });
    const target = createDefaultElement('rectangle', { id: 'target' });
    const child = createDefaultElement('rectangle', { id: 'child', parentId: 'root' });
    const documentData: BroadsetDocument = {
      ...createEmptyBroadsetDocument(),
      elements: [root, target, child],
      animations: [
        { elementId: 'root', config: createStateConfig('owner-active', 'owner-mod') },
        { elementId: 'target', config: createStateConfig('target-active', 'target-mod') },
        { elementId: 'child', config: createStateConfig('child-active', 'child-mod') },
      ],
    };
    const runtimeOverlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame(
        {},
        {},
        {
          activeState: 'owner-active',
          modifiers: new Set(['owner-mod']),
          targetStates: {
            target: { activeState: 'target-active', modifiers: new Set(['target-mod']) },
          },
          childFrames: {
            child: createFrame(
              {},
              {},
              { activeState: 'child-active', modifiers: new Set(['child-mod']), timelineId: 'child-timeline' },
            ),
          },
        },
      ),
    };
    const view = renderPreview({ documentData, runtimeOverlay });

    expect(document.querySelector('[data-element-id="root"]')?.classList.contains('owner-active')).toBe(true);
    expect(document.querySelector('[data-element-id="target"]')?.classList.contains('target-active')).toBe(true);
    expect(document.querySelector('[data-element-id="child"]')?.classList.contains('child-active')).toBe(true);

    view.rerender(
      <ScreenPreview
        allElements={documentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={documentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={null}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    expect(document.querySelector('[data-element-id="root"]')?.classList.contains('owner-active')).toBe(false);
    expect(document.querySelector('[data-element-id="target"]')?.classList.contains('target-active')).toBe(false);
    expect(document.querySelector('[data-element-id="child"]')?.classList.contains('child-active')).toBe(false);
  });

  /** @description Runtime overlay cleanup must also clear target/child state classes when those elements fall back to the owner animation config. */
  it('clears target and child runtime state classes without per-element animation configs', () => {
    const root = createDefaultElement('rectangle', { id: 'root' });
    const target = createDefaultElement('rectangle', { id: 'target' });
    const child = createDefaultElement('rectangle', { id: 'child', parentId: 'root' });
    const documentData: BroadsetDocument = {
      ...createEmptyBroadsetDocument(),
      elements: [root, target, child],
      animations: [{ elementId: 'root', config: createStateConfig('target-active', 'target-mod') }],
    };
    const runtimeOverlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame(
        {},
        {},
        {
          targetStates: {
            target: { activeState: 'target-active', modifiers: new Set(['target-mod']) },
          },
          childFrames: {
            child: createFrame(
              {},
              {},
              { activeState: 'target-active', modifiers: new Set(['target-mod']), timelineId: 'child-timeline' },
            ),
          },
        },
      ),
    };
    const view = renderPreview({ documentData, runtimeOverlay });

    expect(document.querySelector('[data-element-id="target"]')?.classList.contains('target-active')).toBe(true);
    expect(document.querySelector('[data-element-id="child"]')?.classList.contains('target-active')).toBe(true);

    view.rerender(
      <ScreenPreview
        allElements={documentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={documentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={null}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    expect(document.querySelector('[data-element-id="target"]')?.classList.contains('target-active')).toBe(false);
    expect(document.querySelector('[data-element-id="child"]')?.classList.contains('target-active')).toBe(false);
  });

  /** @description Previous DOM-only scrub styles must clear before the renderer repaints a changed base document, otherwise stale animation baselines can overwrite the fresh base paint. */
  it('clears previous DOM-only runtime styles before repainting a document update', () => {
    const documentData = createPreviewDocument();
    const nextDocumentData: BroadsetDocument = {
      ...documentData,
      elements: documentData.elements.map((element) =>
        element.id === 'root' ? { ...element, style: { ...element.style, opacity: 0.6 } } : element,
      ),
    };
    const runtimeOverlay: RuntimeTimelineOverlay = {
      elementId: 'root',
      frame: createFrame({ scaleX: 1.5 }),
    };
    const view = renderPreview({ documentData, runtimeOverlay });

    mocks.clearRuntimeStyles.mockClear();
    mocks.updateDocument.mockClear();

    view.rerender(
      <ScreenPreview
        allElements={nextDocumentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={nextDocumentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={runtimeOverlay}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    const clearOrder = mocks.clearRuntimeStyles.mock.invocationCallOrder.at(0);
    const updateOrder = mocks.updateDocument.mock.invocationCallOrder.at(0);

    expect(clearOrder).toBeDefined();
    expect(updateOrder).toBeDefined();
    expect(clearOrder).toBeLessThan(updateOrder ?? Number.POSITIVE_INFINITY);
  });

  /** @description Document updates during global playback must clear playback-owned styles before repainting fresh base values. */
  it('clears active global playback styles before repainting a document update', () => {
    const documentData = createPreviewDocument();
    const nextDocumentData: BroadsetDocument = {
      ...documentData,
      elements: documentData.elements.map((element) =>
        element.id === 'root' ? { ...element, style: { ...element.style, opacity: 0.6 } } : element,
      ),
    };
    const view = renderPreview({ documentData, isPlaying: true, runtimeOverlay: null });

    mocks.pause.mockClear();
    mocks.play.mockClear();
    mocks.clearPlaybackStyles.mockClear();
    mocks.updateDocument.mockClear();

    view.rerender(
      <ScreenPreview
        allElements={nextDocumentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={nextDocumentData}
        editorStore={createEditorStore()}
        isPlaying
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={null}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.clearPlaybackStyles).toHaveBeenCalled();
    expect(mocks.updateDocument.mock.calls.at(-1)?.[0].elements[0]?.style.opacity).toBe(0.6);
  });

  /** @description Inactive base document repaints before playback has written DOM styles must not clear renderer-owned inline styles. */
  it('does not clear global playback styles before playback has run', () => {
    const documentData = createPreviewDocument();
    const nextDocumentData: BroadsetDocument = {
      ...documentData,
      elements: documentData.elements.map((element) =>
        element.id === 'root' ? { ...element, style: { ...element.style, opacity: 0.6 } } : element,
      ),
    };
    const view = renderPreview({ documentData, isPlaying: false, runtimeOverlay: null });

    mocks.clearPlaybackStyles.mockClear();
    mocks.updateDocument.mockClear();

    view.rerender(
      <ScreenPreview
        allElements={nextDocumentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={nextDocumentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={null}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    expect(mocks.clearPlaybackStyles).not.toHaveBeenCalled();
    expect(mocks.updateDocument.mock.calls.at(-1)?.[0].elements[0]?.style.opacity).toBe(0.6);
  });

  /** @description Base document repaints after playback has run must clear playback DOM styles first so old timeline transforms do not mask editing changes. */
  it('clears global playback styles before repainting a base document update after playback has run', () => {
    const documentData = createPreviewDocument();
    const nextDocumentData: BroadsetDocument = {
      ...documentData,
      elements: documentData.elements.map((element) =>
        element.id === 'root' ? { ...element, style: { ...element.style, opacity: 0.6 } } : element,
      ),
    };
    const view = renderPreview({ documentData, isPlaying: true, runtimeOverlay: null });

    mocks.clearPlaybackStyles.mockClear();
    mocks.updateDocument.mockClear();

    view.rerender(
      <ScreenPreview
        allElements={nextDocumentData.elements}
        clipPathEditingElement={null}
        cursor="default"
        documentData={nextDocumentData}
        editorStore={createEditorStore()}
        isPlaying={false}
        isTransformWidgetSuppressed
        onPlaybackControllerChange={undefined}
        panX={0}
        panY={0}
        pathEditingElement={null}
        perspective={800}
        resetToken={0}
        runtimeOverlay={null}
        selectedElement={null}
        zoom={1}
        onCanvasClick={vi.fn()}
        onCanvasContextMenu={vi.fn()}
        onCanvasPointerMove={vi.fn()}
        onElementTransformCommit={(): void => {}}
        onElementTransformPreview={(): void => {}}
        onViewportChange={vi.fn()}
      />,
    );

    const clearOrder = mocks.clearPlaybackStyles.mock.invocationCallOrder.at(0);
    const updateOrder = mocks.updateDocument.mock.invocationCallOrder.at(0);

    expect(clearOrder).toBeDefined();
    expect(updateOrder).toBeDefined();
    expect(clearOrder).toBeLessThan(updateOrder ?? Number.POSITIVE_INFINITY);
  });
});
