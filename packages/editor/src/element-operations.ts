// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlignableElement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ResizeHandle {
  readonly position: string;
  readonly x: number;
  readonly y: number;
}

interface SnapCandidate {
  readonly position: number;
  readonly distance: number;
}

interface ElementWithParent {
  readonly id: string;
  readonly parentId: string | null;
}

interface PageLike {
  readonly id: string;
  readonly elements: readonly Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Precision helper
// ---------------------------------------------------------------------------

const PRECISION = 2;

function round(value: number): number {
  const factor = 10 ** PRECISION;

  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Alignment and Distribution
// ---------------------------------------------------------------------------

export function alignElements(
  elements: readonly AlignableElement[],
  anchor: 'left' | 'right' | 'center' | 'top' | 'bottom',
): AlignableElement[] {
  if (elements.length === 0) return [];

  switch (anchor) {
    case 'left': {
      const minX = Math.min(...elements.map((e) => e.x));

      return elements.map((e) => ({ ...e, x: minX }));
    }

    case 'right': {
      const maxRight = Math.max(...elements.map((e) => e.x + e.width));

      return elements.map((e) => ({ ...e, x: maxRight - e.width }));
    }

    case 'center': {
      const centerX = (Math.min(...elements.map((e) => e.x)) + Math.max(...elements.map((e) => e.x + e.width))) / 2;

      return elements.map((e) => ({ ...e, x: centerX - e.width / 2 }));
    }

    case 'top': {
      const minY = Math.min(...elements.map((e) => e.y));

      return elements.map((e) => ({ ...e, y: minY }));
    }

    case 'bottom': {
      const maxBottom = Math.max(...elements.map((e) => e.y + e.height));

      return elements.map((e) => ({ ...e, y: maxBottom - e.height }));
    }
  }
}

export function distributeElements(
  elements: readonly AlignableElement[],
  axis: 'horizontal' | 'vertical',
): AlignableElement[] {
  if (elements.length <= 2) return [...elements];

  const sorted = [...elements].sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (first === undefined || last === undefined) return [...elements];

  if (axis === 'horizontal') {
    const totalWidth = sorted.reduce((sum, e) => sum + e.width, 0);
    const totalSpace = last.x + last.width - first.x - totalWidth;
    const gap = totalSpace / (sorted.length - 1);

    let currentX = first.x;

    return sorted.map((e) => {
      const result = { ...e, x: round(currentX) };

      currentX += e.width + gap;

      return result;
    });
  }

  const totalHeight = sorted.reduce((sum, e) => sum + e.height, 0);
  const totalSpace = last.y + last.height - first.y - totalHeight;
  const gap = totalSpace / (sorted.length - 1);

  let currentY = first.y;

  return sorted.map((e) => {
    const result = { ...e, y: round(currentY) };

    currentY += e.height + gap;

    return result;
  });
}

// ---------------------------------------------------------------------------
// Resize-Handle Geometry
// ---------------------------------------------------------------------------

export function getResizeHandlePositions(bounds: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): ResizeHandle[] {
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;

  return [
    { position: 'top-left', x, y },
    { position: 'top', x: cx, y },
    { position: 'top-right', x: x + width, y },
    { position: 'right', x: x + width, y: cy },
    { position: 'bottom-right', x: x + width, y: y + height },
    { position: 'bottom', x: cx, y: y + height },
    { position: 'bottom-left', x, y: y + height },
    { position: 'left', x, y: cy },
  ];
}

// ---------------------------------------------------------------------------
// Shortcut Dispatch Semantics
// ---------------------------------------------------------------------------

export function registerShortcut<T>(registry: Map<string, T>, key: string, handler: T): void {
  registry.set(key, handler);
}

// ---------------------------------------------------------------------------
// Smart-Guide Snapping
// ---------------------------------------------------------------------------

export function resolveSnap(candidates: readonly SnapCandidate[], threshold: number): SnapCandidate | null {
  let best: SnapCandidate | null = null;

  for (const candidate of candidates) {
    if (candidate.distance > threshold) continue;

    if (best === null || candidate.distance < best.distance) {
      best = candidate;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Immutable Document Element Update
// ---------------------------------------------------------------------------

export function updateDocumentElement(
  pages: readonly PageLike[],
  pageIndex: number,
  elementId: string,
  patch: Record<string, unknown>,
): readonly PageLike[] {
  const page = pages[pageIndex];

  if (page === undefined) return pages;

  const elementIndex = page.elements.findIndex((el) => el['id'] === elementId);

  if (elementIndex === -1) return pages;

  const updatedElements = page.elements.map((el, idx) => (idx === elementIndex ? { ...el, ...patch } : el));

  return pages.map((p, idx) => (idx === pageIndex ? { ...p, elements: updatedElements } : p));
}

// ---------------------------------------------------------------------------
// Descendant Collection
// ---------------------------------------------------------------------------

export function collectDescendants(parentId: string, elements: readonly ElementWithParent[]): string[] {
  const result: string[] = [];
  const visited = new Set<string>();

  function recurse(pid: string): void {
    for (const el of elements) {
      if (el.parentId === pid && !visited.has(el.id)) {
        visited.add(el.id);
        result.push(el.id);
        recurse(el.id);
      }
    }
  }

  recurse(parentId);

  return result;
}
