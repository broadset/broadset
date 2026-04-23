import { commitInlineText, type EditorStore, stopInlineTextEditing } from '@broadset/editor';
import { type BroadsetElement, type BroadsetElementStyle, resolveStyleColor } from '@broadset/model';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface InlineTextSnapshot {
  readonly elementId: string | null;
  readonly element: BroadsetElement | null;
}

function snapshotEquals(left: InlineTextSnapshot, right: InlineTextSnapshot): boolean {
  return left.elementId === right.elementId && left.element === right.element;
}

function readSnapshot(store: EditorStore): InlineTextSnapshot {
  const state = store.getState();
  const elementId = state.inlineTextEditingElementId;

  if (elementId === null) {
    return { elementId: null, element: null };
  }

  const element = state.document.elements.find((candidate) => candidate.id === elementId) ?? null;

  return { elementId, element };
}

function useInlineTextSnapshot(store: EditorStore): InlineTextSnapshot {
  const cacheRef = useRef(readSnapshot(store));
  const subscribe = useMemo(
    () =>
      (onStoreChange: () => void): (() => void) =>
        store.subscribe(() => {
          const next = readSnapshot(store);

          if (!snapshotEquals(cacheRef.current, next)) {
            cacheRef.current = next;
            onStoreChange();
          }
        }),
    [store],
  );

  return useSyncExternalStore(
    subscribe,
    () => cacheRef.current,
    () => cacheRef.current,
  );
}

function mapVerticalAlignmentToFlex(value: BroadsetElementStyle['verticalAlignment']): CSSProperties['alignItems'] {
  if (value === 'middle') return 'center';
  if (value === 'bottom') return 'flex-end';

  return 'flex-start';
}

function mapHorizontalAlignmentToFlex(value: BroadsetElementStyle['textAlignment']): CSSProperties['justifyContent'] {
  if (value === 'center') return 'center';
  if (value === 'right') return 'flex-end';
  if (value === 'justify') return 'space-between';

  return 'flex-start';
}

function formatPaddingValue(style: BroadsetElementStyle): string {
  if (style.padding === undefined) return '0px';

  return style.padding.map((value) => `${String(value)}px`).join(' ');
}

interface InlineTextOverlayProps {
  readonly editorStore: EditorStore;
  readonly overlayRoot: HTMLElement;
  readonly worldElement: BroadsetElement | null;
}

export function InlineTextOverlay({
  editorStore,
  overlayRoot,
  worldElement,
}: InlineTextOverlayProps): React.JSX.Element | null {
  const snapshot = useInlineTextSnapshot(editorStore);
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = editorRef.current;

    if (node === null || snapshot.element === null) {
      return;
    }

    node.focus();

    const range = document.createRange();
    const selection = window.getSelection();

    range.selectNodeContents(node);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [snapshot.elementId, snapshot.element]);

  if (snapshot.elementId === null || snapshot.element === null || snapshot.elementId !== worldElement?.id) {
    return null;
  }

  const { element } = snapshot;
  const { style } = element;

  const commit = (): void => {
    const node = editorRef.current;

    if (node === null) return;

    commitInlineText(editorStore, element.id, node.innerHTML);
    stopInlineTextEditing(editorStore);
  };

  const cancel = (): void => {
    stopInlineTextEditing(editorStore);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();

      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit();
    }
  };

  // Container matches the element's renderer contentHost + host chain: outer
  // box carries font and text styling and positions an inner contentEditable
  // via flex alignment. The inner editor wraps long lines within the element
  // width (flex-wrap on the renderer side does the same for per-character
  // spans), so visible glyphs sit on the same lines whether editing or not.
  const containerStyle: CSSProperties = {
    position: 'absolute',
    left: `${String(worldElement.position.x)}px`,
    top: `${String(worldElement.position.y)}px`,
    width: `${String(Math.max(element.width, 1))}px`,
    height: `${String(Math.max(element.height, 1))}px`,
    padding: formatPaddingValue(style),
    boxSizing: 'border-box',
    margin: 0,
    overflow: 'hidden',
    outline: '2px dashed rgba(66, 133, 244, 0.85)',
    outlineOffset: '-1px',
    pointerEvents: 'auto',
    cursor: 'text',
    color: resolveStyleColor(style.fontColor, { resolveTheme: false }) ?? 'inherit',
    fontFamily: style.fontFamily ?? 'inherit',
    fontSize: style.fontSize === undefined ? undefined : `${String(style.fontSize)}px`,
    fontWeight: style.fontWeight ?? 'inherit',
    fontStyle: style.fontStyle ?? 'normal',
    letterSpacing: style.letterSpacing === undefined ? undefined : `${String(style.letterSpacing)}px`,
    lineHeight: style.lineHeight === undefined ? undefined : String(style.lineHeight),
    textDecoration: style.textDecoration ?? 'none',
    textTransform: style.textTransform ?? 'none',
    fontVariationSettings: style.fontVariationSettings ?? 'normal',
    display: 'flex',
    alignItems: mapVerticalAlignmentToFlex(style.verticalAlignment),
    justifyContent: mapHorizontalAlignmentToFlex(style.textAlignment),
    textAlign: style.textAlignment ?? 'left',
    wordBreak: 'break-word',
  };

  return createPortal(
    <div data-testid="inline-text-editor-container" style={containerStyle}>
      <div
        ref={editorRef}
        aria-label="Inline text editor"
        contentEditable
        data-testid="inline-text-editor"
        dangerouslySetInnerHTML={{ __html: element.content }}
        role="textbox"
        spellCheck
        tabIndex={0}
        style={{
          outline: 'none',
          minWidth: '1ch',
          maxWidth: '100%',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          flex: '0 1 auto',
        }}
        suppressContentEditableWarning
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
      />
    </div>,
    overlayRoot,
  );
}
